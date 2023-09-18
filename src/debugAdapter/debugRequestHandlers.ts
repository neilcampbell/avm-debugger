import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent,
	Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { basename } from 'path-browserify';
import { TxnGroupWalkerRuntime, IRuntimeBreakpoint, FileAccessor } from './txnGroupWalkerRuntime';
import { Subject } from 'await-notify';
import * as algosdk from 'algosdk';
import { TEALDebuggingAssets, isAsciiPrintable, limitArray } from './utils';

export enum RuntimeEvents {
	stopOnEntry = 'stopOnEntry',
	stopOnStep = 'stopOnStep',
	stopOnBreakpoint = 'stopOnBreakpoint',
	breakpointValidated = 'breakpointValidated',
	end = 'end',
}

/**
 * This interface describes the teal-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the teal-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the "program" to debug. */
	program: string;
	/** Automatically stop target after launch. If not specified, target does not stop. */
	stopOnEntry?: boolean;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	/** run without debugging */
	noDebug?: boolean;
	/** if specified, results in a simulated compile error in launch. */
	compileError?: 'default' | 'show' | 'hide';
}

interface IAttachRequestArguments extends ILaunchRequestArguments { }


export class TxnGroupDebugSession extends LoggingDebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static threadID = 1;

	// txn group walker runtime for walking txn group.
	private _runtime: TxnGroupWalkerRuntime;

	private _variableHandles = new Handles<'execution' | 'chain' | 'app' | AppStateScope | AppSpecificStateScope | ExecutionScope | AvmValueReference>();

	private _configurationDone = new Subject();

	private _valuesInHex = false;

	private _addressesInHex = true;

	private _debugAssets: TEALDebuggingAssets;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor(fileAccessor: FileAccessor, debugAssets?: TEALDebuggingAssets) {
		super("mock-debug.txt");

		this._debugAssets = <TEALDebuggingAssets>debugAssets;

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		this._runtime = new TxnGroupWalkerRuntime(fileAccessor, this._debugAssets);

		// setup event handlers
		this._runtime.on(RuntimeEvents.stopOnEntry, () => {
			this.sendEvent(new StoppedEvent('entry', TxnGroupDebugSession.threadID));
		});
		this._runtime.on(RuntimeEvents.stopOnStep, () => {
			this.sendEvent(new StoppedEvent('step', TxnGroupDebugSession.threadID));
		});
		this._runtime.on(RuntimeEvents.stopOnBreakpoint, () => {
			this.sendEvent(new StoppedEvent('breakpoint', TxnGroupDebugSession.threadID));
		});
		this._runtime.on(RuntimeEvents.breakpointValidated, (bp: IRuntimeBreakpoint) => {
			this.sendEvent(new BreakpointEvent('changed', { verified: bp.verified, id: bp.id } as DebugProtocol.Breakpoint));
		});
		this._runtime.on(RuntimeEvents.end, () => {
			this.sendEvent(new TerminatedEvent());
		});
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments) {
		await this._runtime.setupSources();

		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		// the adapter implements the configurationDone request.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;

		// make VS Code show a 'step back' button
		response.body.supportsStepBack = true;

		// make VS Code send cancel request
		response.body.supportsCancelRequest = false;

		// make VS Code send the breakpointLocations request
		response.body.supportsBreakpointLocationsRequest = true;

		// make VS Code provide "Step in Target" functionality
		response.body.supportsStepInTargetsRequest = true;

		// TEAL is not so thready.
		response.body.supportsSingleThreadExecutionRequests = false;
		response.body.supportsTerminateThreadsRequest = false;

		// the adapter defines two exceptions filters, one with support for conditions.
		response.body.supportsExceptionFilterOptions = true;
		response.body.exceptionBreakpointFilters = [
			{
				filter: 'namedException',
				label: "Named Exception",
				description: `Break on named exceptions. Enter the exception's name as the Condition.`,
				default: false,
				supportsCondition: true,
				conditionDescription: `Enter the exception's name`
			},
			{
				filter: 'otherExceptions',
				label: "Other Exceptions",
				description: 'This is a other exception',
				default: true,
				supportsCondition: false
			}
		];

		// make VS Code send exceptionInfo request
		// response.body.supportsExceptionInfoRequest = true;

		// make VS Code send setVariable request
		// response.body.supportsSetVariable = true;

		// make VS Code send setExpression request
		// response.body.supportsSetExpression = true;

		// make VS Code send disassemble request
		// response.body.supportsDisassembleRequest = true;
		// response.body.supportsSteppingGranularity = true;
		// response.body.supportsInstructionBreakpoints = true;

		// make VS Code able to read and write variable memory
		// response.body.supportsReadMemoryRequest = true;
		// response.body.supportsWriteMemoryRequest = true;

		response.body.supportSuspendDebuggee = true;
		response.body.supportTerminateDebuggee = true;
		// response.body.supportsFunctionBreakpoints = true;
		response.body.supportsDelayedStackTraceLoading = true;

		this.sendResponse(response);

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());
	}

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

		// notify the launchRequest that configuration has finished
		this._configurationDone.notify();
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
		console.log(`disconnectRequest suspend: ${args.suspendDebuggee}, terminate: ${args.terminateDebuggee}`);
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: IAttachRequestArguments) {
		return this.launchRequest(response, args);
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: ILaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);
		
		// TODO: use args.program

		// wait 1 second until configuration has finished (and configurationDoneRequest has been called)
		await this._configurationDone.wait(1000);

		// start the program in the runtime
		await this._runtime.start(!!args.stopOnEntry, !args.noDebug);

		this.sendResponse(response);
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {

		const path = args.source.path as string;
		const clientBreakpoints = args.breakpoints || [];

		// clear all breakpoints for this file
		this._runtime.clearBreakpoints(path);

		// set and verify breakpoint locations
		const actualBreakpoints0 = clientBreakpoints.map(async clientBp => {
			const { verified, line, id } = await this._runtime.setBreakPoint(path, this.convertClientLineToDebugger(clientBp.line));
			const bp = new Breakpoint(verified, this.convertDebuggerLineToClient(line)) as DebugProtocol.Breakpoint;
			bp.id = id;
			return bp;
		});
		const actualBreakpoints = await Promise.all(actualBreakpoints0);

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};
		this.sendResponse(response);
	}

	protected breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request?: DebugProtocol.Request): void {
		// TODO: shouldn't this get the breakpoints from this._runtime?
		if (args.source.path) {
			response.body = {
				breakpoints: [{ line: args.line, }]
			};
		} else {
			response.body = {
				breakpoints: []
			};
		}
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		// runtime supports no threads so just return a default thread.
		response.body = {
			threads: [
				new Thread(TxnGroupDebugSession.threadID, "thread 1"),
			]
		};
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
		const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
		const endFrame = startFrame + maxLevels;

		const stk = this._runtime.stack(startFrame, endFrame);

		response.body = {
			stackFrames: stk.frames.map((f, ix) => {
				const sf: DebugProtocol.StackFrame = new StackFrame(f.index, f.name, this.createSource(f.file), this.convertDebuggerLineToClient(f.line));
				return sf;
			}),
			// 4 options for 'totalFrames':
			//omit totalFrames property: 	// VS Code has to probe/guess. Should result in a max. of two requests
			// totalFrames: stk.count			// stk.count is the correct size, should result in a max. of two requests
			//totalFrames: 1000000 			// not the correct size, should result in a max. of two requests
			//totalFrames: endFrame + 20 	// dynamically increases the size with every requested chunk, results in paging
		};
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

		response.body = {
			scopes: [
				new Scope("Execution State", this._variableHandles.create('execution'), false),
				new Scope("On-chain State", this._variableHandles.create('chain'), false),
			]
		};
		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): Promise<void> {
		let variables: DebugProtocol.Variable[] = [];

		const v = this._variableHandles.get(args.variablesReference);

		if (v === 'execution') {
			const stackValues = this._runtime.getStackValues();
			variables = [
				{
					name: 'pc',
					value: this._runtime.getPC().toString(),
					type: 'uint64',
					variablesReference: 0,
				},
				{
					name: 'stack',
					value: stackValues.length === 0 ? '[]' : '[...]',
					type: 'array',
					variablesReference: this._variableHandles.create('stack'),
					namedVariables: 1,
					indexedVariables: stackValues.length,
					presentationHint: {
						kind: 'data',
					},
				},
				{
					name: 'scratch',
					value: '[...]',
					type: 'array',
					variablesReference: this._variableHandles.create('scratch'),
					indexedVariables: 256,
					presentationHint: {
						kind: 'data',
					},
				}
			];
		} else if (v === 'stack') {
			const stackValues = this._runtime.getStackValues();
			if (args.filter !== 'named') {
				variables = stackValues.map((value, index) => this.convertAvmValue('stack', value, index));
			}
		} else if (v === 'scratch') {
			const scratchValues = this._runtime.getScratchValues();
			if (args.filter !== 'named') {
				variables = scratchValues.map((value, index) => this.convertAvmValue('scratch', value, index));
			}
		} else if (v === 'chain') {
			const appIDs = this._runtime.getAppStateReferences();
			variables = [{
				name: 'app',
				value: '',
				type: 'object',
				variablesReference: this._variableHandles.create('app'),
				namedVariables: appIDs.length
			}];
		} else if (v === 'app') {
			const appIDs = this._runtime.getAppStateReferences();
			variables = appIDs.map(appID => ({
				name: appID.toString(),
				value: '',
				type: 'object',
				variablesReference: this._variableHandles.create(new AppStateScope(appID)),
				namedVariables: 3,
			}));
		} else if (v instanceof AppStateScope) {
			variables = [
				{
					name: 'global',
					value: '',
					type: 'object',
					variablesReference: this._variableHandles.create(new AppSpecificStateScope({ scope: 'global', appID: v.appID })),
					namedVariables: 1, // TODO
				},
				{
					name: 'local',
					value: '',
					type: 'object',
					variablesReference: this._variableHandles.create(new AppSpecificStateScope({ scope: 'local', appID: v.appID })),
					namedVariables: 1, // TODO
				},
				{
					name: 'box',
					value: '',
					type: 'object',
					variablesReference: this._variableHandles.create(new AppSpecificStateScope({ scope: 'box', appID: v.appID })),
					namedVariables: 1, // TODO
				}
			];
		} else if (v instanceof AppSpecificStateScope) {
			const state = this._runtime.getAppState(v.appID);
			if (v.scope === 'global') {
				variables = state.globalStateArray().map(kv => this.convertAvmKeyValue(v, kv));
			} else if (v.scope === 'local') {
				if (typeof v.account === 'undefined') {
					const accounts = this._runtime.getAppLocalStateAccounts(v.appID);
					variables = accounts.map(account => ({
						name: account,
						value: 'local state',
						type: 'object',
						variablesReference: this._variableHandles.create(new AppSpecificStateScope({ scope: 'local', appID: v.appID, account })),
						namedVariables: 1, // TODO
						evaluateName: evaluateNameForScope(v, account),
					}));
				} else {
					variables = state.localStateArray(v.account).map(kv => this.convertAvmKeyValue(v, kv));
				}
			} else if (v.scope === 'box') {
				variables = state.boxStateArray().map(kv => this.convertAvmKeyValue(v, kv));
			}
		} else if (v instanceof AvmValueReference) {
			if (typeof v.scope === 'string') {
				let toExpand: algosdk.modelsv2.AvmValue;
				if (v.scope === 'stack') {
					const stackValues = this._runtime.getStackValues();
					toExpand = stackValues[v.key as number];
				} else if (v.scope === 'scratch') {
					const scratchValues = this._runtime.getScratchValues();
					toExpand = scratchValues[v.key as number];
				} else {
					throw new Error(`Unexpected AvmValueReference scope: ${v.scope}`);
				}
				variables = this.expandAvmValue(toExpand, args.filter);
			} else if (v.scope instanceof AppSpecificStateScope && typeof v.key === 'string' && v.key.startsWith('0x')) {
				let toExpand: algosdk.modelsv2.AvmKeyValue;
				const state = this._runtime.getAppState(v.scope.appID);
				const keyHex = v.key.slice(2);
				if (v.scope.scope === 'global') {
					const value = state.globalState.getHex(keyHex);
					if (value) {
						const keyBytes = Buffer.from(keyHex, 'hex');
						toExpand = new algosdk.modelsv2.AvmKeyValue({ key: keyBytes, value });
					} else {
						throw new Error(`key "${v.key}" not found in global state`);
					}
				} else if (v.scope.scope === 'local') {
					if (typeof v.scope.account === 'undefined') {
						throw new Error('this shouldn\'t happen: ' + JSON.stringify(v));
					} else {
						const accountState = state.localState.get(v.scope.account);
						if (!accountState) {
							throw new Error(`account "${v.scope.account}" not found in local state`);
						}
						const value = accountState.getHex(keyHex);
						if (!value) {
							throw new Error(`key "${v.key}" not found in local state for account "${v.scope.account}"`);
						}
						toExpand = new algosdk.modelsv2.AvmKeyValue({ key: Buffer.from(keyHex, 'hex'), value });
					}
				} else if (v.scope.scope === 'box') {
					const value = state.boxState.getHex(keyHex);
					if (value) {
						const keyBytes = Buffer.from(keyHex, 'hex');
						toExpand = new algosdk.modelsv2.AvmKeyValue({ key: keyBytes, value });
					} else {
						throw new Error(`key "${v.key}" not found in box state`);
					}
				} else {
					throw new Error(`Unexpected AppSpecificStateScope scope: ${v.scope}`);
				}
				variables = this.expandAvmKeyValue(v.scope, toExpand, args.filter);
			}
		}

		variables = limitArray(variables, args.start, args.count);

		response.body = {
			variables
		};
		this.sendResponse(response);
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
		let reply: string | undefined;
		let rv: DebugProtocol.Variable | undefined = undefined;

		// Note, can use args.context to perform different actions based on where the expression is evaluated

		let result: [AvmValueScope, number | string] | undefined = undefined;
		try {
			result = evaluateNameToScope(args.expression);
		} catch (e) {
			reply = (e as Error).message;
		}

		if (result) {
			const [scope, key] = result;
			if (scope === 'stack') {
				let index = key as number;
				const stackValues = this._runtime.getStackValues();
				if (index < 0) {
					const adjustedIndex = index + stackValues.length;
					if (adjustedIndex < 0) {
						reply = `stack[${index}] out of range`;
					} else {
						index = adjustedIndex;
					}
				}
				if (0 <= index && index < stackValues.length) {
					rv = this.convertAvmValue('stack', stackValues[index], index);
				} else if (index < 0 && stackValues.length + index >= 0) {
					rv = this.convertAvmValue('stack', stackValues[stackValues.length + index], index);
				} else {
					reply = `stack[${index}] out of range`;
				}
			} else if (scope === 'scratch') {
				const index = key as number;
				const scratchValues = this._runtime.getScratchValues();
				if (0 <= index && index < scratchValues.length) {
					rv = this.convertAvmValue('scratch', scratchValues[index], index);
				} else {
					reply = `scratch[${index}] out of range`;
				}
			} else if (typeof key === 'string') {
				const state = this._runtime.getAppState(scope.appID);
				if (scope.property) {
					reply = `cannot evaluate property "${scope.property}"`;
				} else if (scope.scope === 'global' && key.startsWith('0x')) {
					const keyHex = key.slice(2);
					const value = state.globalState.getHex(keyHex);
					if (value) {
						const keyBytes = Buffer.from(keyHex, 'hex');
						const kv = new algosdk.modelsv2.AvmKeyValue({ key: keyBytes, value });
						rv = this.convertAvmKeyValue(scope, kv);
					} else {
						reply = `key "${key}" not found in global state`;
					}
				} else if (scope.scope === 'local') {
					if (typeof scope.account === 'undefined') {
						rv = {
							name: key,
							value: 'local state',
							type: 'object',
							variablesReference: this._variableHandles.create(new AppSpecificStateScope({ scope: 'local', appID: scope.appID, account: key })),
							namedVariables: 1, // TODO
							evaluateName: evaluateNameForScope(scope, key),
						};
					} else {
						const accountState = state.localState.get(scope.account);
						if (!accountState) {
							reply = `account "${scope.account}" not found in local state`;
						} else if (key.startsWith('0x')) {
							const keyHex = key.slice(2);
							const value = accountState.getHex(keyHex);
							if (value) {
								const keyBytes = Buffer.from(keyHex, 'hex');
								const kv = new algosdk.modelsv2.AvmKeyValue({ key: keyBytes, value });
								rv = this.convertAvmKeyValue(scope, kv);
							} else {
								reply = `key "${key}" not found in local state for account "${scope.account}"`;
							}
						} else {
							reply = `cannot evaluate property "${key}"`;
						}
					}
				} else if (scope.scope === 'box' && key.startsWith('0x')) {
					const keyHex = key.slice(2);
					const value = state.boxState.getHex(keyHex);
					if (value) {
						const keyBytes = Buffer.from(keyHex, 'hex');
						const kv = new algosdk.modelsv2.AvmKeyValue({ key: keyBytes, value });
						rv = this.convertAvmKeyValue(scope, kv);
					} else {
						reply = `key "${key}" not found in box state`;
					}
				}
			}
		}

		if (rv) {
			response.body = {
				result: rv.value,
				type: rv.type,
				variablesReference: rv.variablesReference,
				presentationHint: rv.presentationHint
			};
		} else {
			response.body = {
				result: reply || `unknown expression: "${args.expression}"`,
				variablesReference: 0
			};
		}

		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this._runtime.continue(false);
		this.sendResponse(response);
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {
		this._runtime.continue(true);
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this._runtime.step(false);
		this.sendResponse(response);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		this._runtime.step(true);
		this.sendResponse(response);
	}

	protected stepInTargetsRequest(response: DebugProtocol.StepInTargetsResponse, args: DebugProtocol.StepInTargetsArguments) {
		const targets = this._runtime.getStepInTargets(args.frameId);
		response.body = {
			targets: targets.map(t => {
				return { id: t.id, label: t.label };
			})
		};
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this._runtime.stepIn(args.targetId);
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		this._runtime.stepOut();
		this.sendResponse(response);
	}

	//---- helpers

	private convertAvmValue(scope: AvmValueScope, avmValue: algosdk.modelsv2.AvmValue, key: number | string, overrideVariableReference?: boolean): DebugProtocol.Variable {
		let namedVariables: number | undefined = undefined;
		let indexedVariables: number | undefined = undefined;
		let presentationHint: DebugProtocol.VariablePresentationHint | undefined = undefined;
		let makeVariableReference = false;
		if (avmValue.type === 1) {
			// byte array
			const bytes = avmValue.bytes || new Uint8Array();
			namedVariables = 2;
			if (isAsciiPrintable(bytes)) {
				namedVariables++;
			}
			indexedVariables = bytes.length;
			presentationHint = {
				kind: 'data',
				attributes: ['rawString'],
			};
			makeVariableReference = true;
		}
		if (typeof overrideVariableReference !== 'undefined') {
			makeVariableReference = overrideVariableReference;
		}
		return {
			name: key.toString(),
			value: this.avmValueToString(avmValue),
			type: avmValue.type === 1 ? 'byte[]' : 'uint64',
			variablesReference: makeVariableReference ? this._variableHandles.create(new AvmValueReference(scope, key)) : 0,
			namedVariables,
			indexedVariables,
			presentationHint,
			evaluateName: evaluateNameForScope(scope, key),
		};
	}

	private expandAvmValue(avmValue: algosdk.modelsv2.AvmValue, filter?: DebugProtocol.VariablesArguments['filter']): DebugProtocol.Variable[] {
		if (avmValue.type !== 1) {
			return [];
		}

		const bytes = avmValue.bytes || new Uint8Array();

		const values: DebugProtocol.Variable[] = [];

		if (filter !== 'indexed') {
			let formats: BufferEncoding[] = ['hex', 'base64'];
			if (isAsciiPrintable(bytes)) {
				// TODO: perhaps do this with UTF-8 instead, see https://stackoverflow.com/questions/75108373/how-to-check-if-a-node-js-buffer-contains-valid-utf-8
				formats.push('ascii');
			}
			if (bytes.length === 0) {
				formats = [];
			}

			for (const format of formats) {
				values.push({
					name: format,
					type: 'string',
					value: Buffer.from(bytes).toString(format),
					variablesReference: 0,
				});
			}

			if (bytes.length === 32) {
				values.push({
					name: 'address',
					type: 'string',
					value: algosdk.encodeAddress(bytes),
					variablesReference: 0,
				});
			}

			values.push({
				name: 'length',
				type: 'int',
				value: bytes.length.toString(),
				variablesReference: 0,
			});
		}

		if (filter !== 'named') {
			for (let i = 0; i < bytes.length; i++) {
				values.push({
					name: i.toString(),
					type: 'uint8',
					value: bytes[i].toString(),
					variablesReference: 0,
				});
			}
		}

		return values;
	}

	private convertAvmKeyValue(scope: AvmValueScope, avmKeyValue: algosdk.modelsv2.AvmKeyValue): DebugProtocol.Variable {
		const keyString = '0x' + Buffer.from(avmKeyValue.key || new Uint8Array()).toString('hex');
		const value = this.convertAvmValue(scope, avmKeyValue.value, keyString, true);
		delete value.indexedVariables;
		value.namedVariables = 2;
		return value;
	}

	private expandAvmKeyValue(scope: AppSpecificStateScope, avmKeyValue: algosdk.modelsv2.AvmKeyValue, filter?: DebugProtocol.VariablesArguments['filter']): DebugProtocol.Variable[] {
		if (typeof scope.property === 'undefined') {
			if (filter === 'indexed') {
				return [];
			}
			const keyString = '0x' + Buffer.from(avmKeyValue.key || new Uint8Array()).toString('hex');
			const keyScope = new AppSpecificStateScope({ scope: scope.scope, appID: scope.appID, account: scope.account, property: 'key' });
			const valueScope = new AppSpecificStateScope({ scope: scope.scope, appID: scope.appID, account: scope.account, property: 'value' });
			const keyVariable = this.convertAvmValue(keyScope, new algosdk.modelsv2.AvmValue({ type: 1, bytes: avmKeyValue.key }), '', false);
			const valueVariable = this.convertAvmValue(valueScope, avmKeyValue.value, '', false);
			const valueHasChildren = valueVariable.namedVariables || valueVariable.indexedVariables;
			return [
				{
					name: 'key',
					type: keyVariable.type,
					value: keyVariable.value,
					variablesReference: this._variableHandles.create(new AvmValueReference(keyScope, keyString)),
					namedVariables: keyVariable.namedVariables,
					indexedVariables: keyVariable.indexedVariables,
					presentationHint: keyVariable.presentationHint,
					// evaluateName: evaluateNameForScope(keyScope, keyString),
				}, {
					name: 'value',
					type: keyVariable.type,
					value: valueVariable.value,
					variablesReference: valueHasChildren ? this._variableHandles.create(new AvmValueReference(valueScope, keyString)) : 0,
					namedVariables: keyVariable.namedVariables,
					indexedVariables: keyVariable.indexedVariables,
					presentationHint: keyVariable.presentationHint,
					// evaluateName: valueHasChildren ? evaluateNameForScope(valueScope, keyString) : '',
				}
			];
		}

		if (scope.property === 'key') {
			const avmKey = new algosdk.modelsv2.AvmValue({ type: 1, bytes: avmKeyValue.key });
			return this.expandAvmValue(avmKey, filter);
		}

		return this.expandAvmValue(avmKeyValue.value, filter);
	}

	private avmValueToString(avmValue: algosdk.modelsv2.AvmValue): string {
		if (avmValue.type === 1) {
			// byte array
			const bytes = avmValue.bytes || new Uint8Array();
			return '0x' + Buffer.from(bytes).toString('hex');
		}
		// uint64
		const uint = avmValue.uint || 0;
		return uint.toString();
	}

	private formatAddress(x: number, pad = 8) {
		return this._addressesInHex ? '0x' + x.toString(16).padStart(8, '0') : x.toString(10);
	}

	private formatNumber(x: number) {
		return this._valuesInHex ? '0x' + x.toString(16) : x.toString(10);
	}

	private createSource(filePath: string): Source {
		return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, 'teal-txn-group-adapter-data');
	}
}

type ExecutionScope = 'stack' | 'scratch';

class AppStateScope {
	constructor(public readonly appID: number) { }
}

class AppSpecificStateScope {
	public readonly scope: 'global' | 'local' | 'box';
	public readonly appID: number;
	public readonly account?: string;
	public readonly property?: 'key' | 'value';

	constructor({
		scope,
		appID,
		account,
		property
	}: {
		scope: 'global' | 'local' | 'box',
		appID: number,
		account?: string,
		property?: 'key' | 'value'
	}) {
		this.scope = scope;
		this.appID = appID;
		this.account = account;
		this.property = property;
	}
}

type AvmValueScope = ExecutionScope | AppSpecificStateScope;

class AvmValueReference {
	constructor(
		public readonly scope: AvmValueScope,
		public readonly key: number | string
	) { }
}

function evaluateNameForScope(scope: AvmValueScope, key: number | string): string {
	if (typeof scope === 'string') {
		return `${scope}[${key}]`;
	}
	if (scope.scope === 'local') {
		if (typeof scope.account === 'undefined') {
			return `app[${scope.appID}].local[${key}]`;
		}
		return `app[${scope.appID}].local[${scope.account}][${key}]`;
	}
	return `app[${scope.appID}].${scope.scope}[${key}]${scope.property ? '.' + scope.property : ''}`;
}

function evaluateNameToScope(name: string): [AvmValueScope, key: number | string] {
	const stackMatches = /^stack\[(-?\d+)\]$/.exec(name);
	if (stackMatches) {
		return ['stack', parseInt(stackMatches[1], 10)];
	}
	const scratchMatches = /^scratch\[(\d+)\]$/.exec(name);
	if (scratchMatches) {
		return ['scratch', parseInt(scratchMatches[1], 10)];
	}
	const appMatches = /^app\[(\d+)\]\.(global|box)\[(0[xX][0-9a-fA-F]+)\](?:\.(key|value))?$/.exec(name);
	if (appMatches) {
		const scope = appMatches[2];
		if (scope !== 'global' && scope !== 'box') {
			throw new Error(`Unexpected app scope: ${scope}`);
		}
		const property = appMatches.length > 4 ? appMatches[4] : undefined;
		if (typeof property !== 'undefined' && property !== 'key' && property !== 'value') {
			throw new Error(`Unexpected app property: ${property}`);
		}
		const newScope = new AppSpecificStateScope({
			scope: scope,
			appID: parseInt(appMatches[1], 10),
			property
		});
		return [newScope, appMatches[3]];
	}
	const appLocalMatches = /^app\[(\d+)\]\.local\[([A-Z2-7]{58})\](?:\[(0[xX][0-9a-fA-F]+)\](?:\.(key|value))?)?$/.exec(name);
	if (appLocalMatches) {
		const property = appLocalMatches.length > 4 ? appLocalMatches[4] : undefined;
		if (typeof property !== 'undefined' && property !== 'key' && property !== 'value') {
			throw new Error(`Unexpected app property: ${property}`);
		}
		try {
			algosdk.decodeAddress(appLocalMatches[2]); // ensure valid address
		} catch {
			throw new Error(`Invalid address: ${appLocalMatches[2]}:`);
		}
		let account: string | undefined;
		let key: string;
		if (appLocalMatches.length > 3 && typeof appLocalMatches[3] !== 'undefined') {
			account = appLocalMatches[2];
			key = appLocalMatches[3];
		} else {
			account = undefined;
			key = appLocalMatches[2];
		}
		const newScope = new AppSpecificStateScope({
			scope: 'local',
			appID: parseInt(appLocalMatches[1], 10),
			account,
			property
		});
		return [newScope, key];
	}
	throw new Error(`Unexpected expression: ${name}`);
}