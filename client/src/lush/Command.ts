// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/wolfy87-eventemitter.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="Ctrl.ts" />

import * as $ from "jquery";
import * as EventEmitter from "EventEmitter";
import * as Ctrl from "./Ctrl";
import * as U from "./utils";
import globals from "./globals";

interface StatusData {
    code: number;
    err: string;
}

export interface Userdata {
    archived: boolean;
    // Internal: used by "create command on server" routine to identify which
    // callback to invoke when server replies (asynchronously) that command has
    // been created.
    callback?: string;
    // Opaque value set to identify which module requested the creation of this
    // command. Can be used to filter which "new command" events to ignore or
    // act on.
    creator?: string;
    // Set by "create command on server" routine to the ID of this client
    // instance (globals.moi). Useful to filter which command was created by
    // whom. Optional to allow UserData types for initialisation by modules,
    // but always set when part of a Command.
    god?: string;
    unused?: boolean;
}

/***** Events *****/

interface Handler<T extends CommandEvent> {
    (e: T): void;
}

interface EventCls {
    eventName: string;
}

export class CommandEvent {
    from: string;
    cmd: Command;
}

// Command is not root anymore. Note that commands can only have one parent.
export class ParentAddedEvent extends CommandEvent {
    static eventName = "ParentAddedEvent";
    constructor(public newparent: Command) {
        super();
    }
}

// This command is now a root.
export class ParentRemovedEvent extends CommandEvent {
    static eventName = "ParentRemovedEvent";
    constructor(public oldparent: Command) {
        super();
    }
}

// An output pipe of this command is now connected to another command.
export class ChildAddedEvent extends CommandEvent {
    static eventName = "ChildAddedEvent";
    constructor(public newchild: Command, public streamname: string) {
        super();
    }
}

// An output pipe is disconnected from a command.
export class ChildRemovedEvent extends CommandEvent {
    static eventName = "ChildRemovedEvent";
    constructor(public oldchild: Command, public streamname: string) {
        super();
    }
}

// The running command is generating data on stdout. The member is only the new
// data.
export class StreamStdoutEvent extends CommandEvent {
    static eventName = "StreamStdoutEvent";
    constructor(public data: string) { super(); }
}

// The running command is generating data on stderr. The member is only the new
// data.
export class StreamStderrEvent extends CommandEvent {
    static eventName = "StreamStderrEvent";
    constructor(public data: string) { super(); }
}

// Command is being (un)archived. can be caused by a server event, by the user
// minimizing the widget, or by a parent widget being minimized. should not be
// propagated by registered handlers (is propagated by the Command object). the
// parameter is a boolean that is true for archiving, false for unarchiving.
export class ArchivalEvent extends CommandEvent {
    static eventName = "ArchivalEvent";
    constructor(public archived: boolean) { super(); }
}

// The status is updated from active to either success or error.
export class DoneEvent extends CommandEvent {
    static eventName = "DoneEvent";
    constructor(public status: StatusData) { super(); }
}

// Resources associated with the command have been released by the server and
// the client wants to clean up the command. Any resources that will not be
// garbage collected automatically should be freed here.
export class WasReleasedEvent extends CommandEvent {
    static eventName = "WasReleasedEvent";
}

// Update events represent changes in the command properties. The Update***Event
// classes are special: they all have a constructor taking the updated property
// as its only argument and they all register with the updateEvNames map.

var updateEvNames: { [name: string]: { new(val: any): CommandEvent } } = {};

export class UpdatedArgsEvent extends CommandEvent {
    static eventName = "UpdatedArgsEvent";
    constructor(public args: string[]) { super(); }
}
updateEvNames['args'] = UpdatedArgsEvent;

export class UpdatedCmdEvent extends CommandEvent {
    static eventName = "UpdatedCmdEvent";
    // base export class already has a "cmd" member
    constructor(public cmdprop: string) { super(); }
}
updateEvNames['cmd'] = UpdatedCmdEvent;

export class UpdatedCwdEvent extends CommandEvent {
    static eventName = "UpdatedCwdEvent";
    constructor(public cwd: string) { super(); }
}
updateEvNames['cwd'] = UpdatedCwdEvent;

export class UpdatedNameEvent extends CommandEvent {
    static eventName = "UpdatedNameEvent";
    constructor(public name: string) { super(); }
}
updateEvNames['name'] = UpdatedNameEvent;

export class UpdatedStartwdEvent extends CommandEvent {
    static eventName = "UpdatedStartwdEvent";
    constructor(public startwd: string) { super(); }
}
updateEvNames['startwd'] = UpdatedStartwdEvent;

export class UpdatedStatusEvent extends CommandEvent {
    static eventName = "UpdatedStatusEvent";
    constructor(public newstatus: StatusData) { super(); }
}
updateEvNames['status'] = UpdatedStatusEvent;

export class UpdatedStderrEvent extends CommandEvent {
    static eventName = "UpdatedStderrEvent";
    constructor(public stderr: string) { super(); }
}
updateEvNames['stderr'] = UpdatedStderrEvent;

export class UpdatedStderrScrollbackEvent extends CommandEvent {
    static eventName = "UpdatedStderrScrollbackEvent";
    constructor(public stderrScrollback: number) { super(); }
}
updateEvNames['stderrScrollback'] = UpdatedStderrScrollbackEvent

export class UpdatedStderrtoEvent extends CommandEvent {
    static eventName = "UpdatedStderrtoEvent";
    constructor(public stderrto: number) { super(); }
}
updateEvNames['stderrto'] = UpdatedStderrtoEvent;

export class UpdatedStdoutEvent extends CommandEvent {
    static eventName = "UpdatedStdoutEvent";
    constructor(public stdout: string) { super(); }
}
updateEvNames['stdout'] = UpdatedStdoutEvent;

export class UpdatedStdoutScrollbackEvent extends CommandEvent {
    static eventName = "UpdatedStdoutScrollbackEvent";
    constructor(public stdoutScrollback: number) { super(); }
}
updateEvNames['stdoutScrollback'] = UpdatedStdoutScrollbackEvent;

export class UpdatedStdouttoEvent extends CommandEvent {
    static eventName = "UpdatedStdouttoEvent";
    constructor(public stdoutto: number) { super(); }
}
updateEvNames['stdoutto'] = UpdatedStdouttoEvent;

export class UpdatedUserdataEvent extends CommandEvent {
    static eventName = "UpdatedUserdataEvent";
    constructor(public userdata: Userdata) { super(); }
}
updateEvNames['userdata'] = UpdatedUserdataEvent;


/***** Helper functions *****/

function arraysEqual(ar1: any[], ar2: any[]) {
    if (ar1.length !== ar2.length) {
        return false;
    }
    for (var i = 0; i < ar1.length; i++) {
        if (ar1[i] != ar2[i]) {
            return false;
        }
    }
    return true;
}

function createUpdatedEvent(prop: string, value: any, by: string): CommandEvent {
    var cls = updateEvNames[prop];
    if (undefined === cls) {
        throw new Error("Updating unknown property: " + prop);
    }
    var ev = new cls(value);
    ev.from = by;
    return ev;
}

/***** The command object *****/

// Command object synchronized with server. The properties of this object are
// specified by implementation, see the properties in the Command class. Ideally
// there should be a good spec between the server and this class, but for now
// it's loosely defined.
export class Command {
    nid: number;
    htmlid: string;
    name: string;
    cmd: string;
    args: string[];
    cwd: string;
    startwd: string;
    status: StatusData;
    stdoutto: number;
    stderrto: number;
    stdoutScrollback: number;
    stderrScrollback: number;
    userdata: Userdata;
    stdout: string;
    stderr: string;
    god: string;

    private parentId: number;

    private processInitData(init: any) {
        this.nid = init.nid;
        this.htmlid = init.htmlid;
        this.name = init.name;
        this.cmd = init.cmd;
        this.cwd = init.cwd;
        this.startwd = init.startwd;
        this.status = init.status;
        this.stdoutScrollback = init.stdoutScrollback;
        this.stderrScrollback = init.stderrScrollback;
        this.stdoutto = init.stdoutto;
        this.stderrto = init.stderrto;
        /* default values for properties */
        this.stdout = init.stdout || "";
        this.stderr = init.stderr || "";
        this.userdata = init.userdata || {};
        this.args = init.args || [];
        if (!$.isArray(this.args)) {
            throw new Error("init data .args property must be string[]");
        }
    }

    /***** Events *****/

    private ee = new EventEmitter();

    // Handler gets generic CommandEvent instance
    onany(C: EventCls[], f: Handler<CommandEvent>) {
        var cmd = this;
        var f_ = (e: CommandEvent) => f.call(cmd, e);
        C.forEach(C_ => cmd.ee.on(C_.eventName, f_));
        return () => C.forEach(C_ => cmd.ee.off(C_.eventName, f_));
    }

    on<T extends CommandEvent>(C: EventCls, f: Handler<T>) {
        f = f.bind(this);
        this.ee.on(C.eventName, f);
        return () => this.ee.off(C.eventName, f);
    }

    one<T extends CommandEvent>(C: EventCls, f: Handler<T>): Function {
        f = f.bind(this);
        this.ee.once(C.eventName, f);
        return () => this.ee.off(C.eventName, f);
    }

    trigger<T extends CommandEvent>(e: T, from?: string) {
        e.cmd = this;
        if (undefined !== from) {
            e.from = from;
        }
        // Typescript doesn't support declaring a constructor with arbitrary
        // arguments, so declaring C to implement Factory<T> will cause an
        // error if you overload the constructor in an event subclass.
        var C: EventCls = <any>e.constructor;
        this.ee.trigger(C.eventName, [e]);
    }

    /***** Rest *****/

    // third arg is a uuid identifying this session
    constructor(private ctrl: Ctrl.Ctrl, init, private _moi: string) {
        var cmd = this;
        this.processInitData(init);
        var off = cmd.on(UpdatedStatusEvent, function (e: UpdatedStatusEvent) {
            var cmd: Command = e.cmd;
            if (e.newstatus.code > 1) {
                cmd.trigger(new DoneEvent(cmd.status));
                off(); // no need for me anymore
            }
        });
        cmd.on(StreamStdoutEvent, function (e: StreamStdoutEvent) {
            var cmd = e.cmd;
            cmd.stdout += e.data;
            cmd.trigger(new UpdatedStdoutEvent(cmd.stdout))
        });
        cmd.on(StreamStderrEvent, function (e: StreamStderrEvent) {
            var cmd = e.cmd;
            cmd.stderr += e.data;
            cmd.trigger(new UpdatedStderrEvent(cmd.stderr))
        });
    }

    imadethis(): boolean {
        var cmd = this;
        return cmd._moi && cmd._moi == cmd.userdata.god;
    }

    // update the state of archival on the server
    setArchivalState(state: boolean): void {
        var cmd = this;
        cmd.update({userdata: {archived: state}});
    }

    // Process response data from server after sending an update request.
    // Request may have been sent by another client.
    processUpdateResponse(response) {
        var cmd = this;
        var prop = response.prop;
        var value = response.value;
        var updatedby, callbackId;

        function makeChildModObject(fromid: number, toid: number) {
            return {
                from: globals.cmds[fromid],
                to: globals.cmds[toid],
            };
        }

        if (response.userdata) {
            updatedby = response.userdata.by;
            callbackId = response.userdata.callback;
        }
        // Track modifications to hierarchy for appropriate event raising later
        var childMod: { [streamname: string]: { from: Command; to: Command } } = {};
        if (prop == "stdoutto") {
            childMod['stdout'] = 
                makeChildModObject(cmd.stdoutto, value);
        } else if (prop == "stderrto") {
            childMod['stderr'] = 
                makeChildModObject(cmd.stderrto, value);
        }
        var archivalStateChanged =
            (
                prop === "userdata" &&
                value.archived !== undefined &&
                value.archived !== cmd.userdata.archived
            );
        cmd[prop] = value;
        // per-property update event
        cmd.trigger(createUpdatedEvent(prop, value, updatedby));
        // trigger child/parent add/remove event if relevant
        for (var stream in childMod) {
            var mod = childMod[stream];
            if (mod.from !== undefined) {
                mod.from.processSetParent(null);
                cmd.trigger(new ChildRemovedEvent(mod.from, stream));
            }
            if (mod.to !== undefined) {
                mod.to.processSetParent(cmd);
                cmd.trigger(new ChildAddedEvent(mod.to, stream));
            }
        }
        if (archivalStateChanged) {
            // if the server tells me that I've been (de)archived, generate an
            // "archival" jQuery event
            if (!cmd.isRoot()) {
                throw new Error("Received archival event on non-root node " + cmd.nid);
            }
            cmd.trigger(new ArchivalEvent(value.archived));
        }
        if (callbackId) {
            $(cmd).trigger('callback.' + callbackId);
        }
    }

    // request an update. the first argument is an object containing the
    // properties that should be updated and their new values. because the
    // command object is not opaque (its signature is defined) the properties
    // are handled semantically: numbers, strings and arrays are replaced,
    // object properties (i.e. the userdata prop) are extended. to clear an
    // object property, set it to null. this will set the object to {}. that
    // convention makes the semantics of this method odd, but code using it is
    // more intuitive (extending the object is what you want 99% of the time).
    //
    // the second argument (optional) is a string signature of who is causing
    // this update.  this is passed verbatim as the event parameter to handlers.
    // they can use that to handle some updates in special ways, e.g. the CLI
    // view ignores updates generated by editing the CLI.
    //
    // the third argument (optional) is a callback to call when done. it is
    // called with this command as the first argument, the by (if any) as the
    // second.
    update(updata, by?: string, callback?: (cmd: Command, by?: string) => void) {
        var cmd = this;
        // actual function is hooked up to this command client-side, an id local
        // to this function is sent to server instead
        var callbackId = callback ? U.guid() : null;
        var reqs = [];
        $.each(updata, function (key, val) {
            var req = {
                name: cmd.htmlid,
                prop: key,
                userdata: {
                    by: by,
                    callback: callbackId,
                },
                value: val,
            };
            // allowed update keys
            switch (key) {
            case "args":
                if (!$.isArray(val)) {
                    throw new Error("args must be an array, is: " + val);
                }
                if (!val.every(U.isString)) {
                    throw new Error("every member of args must be a string");
                }
                if (arraysEqual(cmd.args, val)) {
                    return;
                }
                break;
            case "userdata":
                if (!$.isPlainObject(val)) {
                    throw new Error("userdata must be a plain object, is: " + val);
                }
                // prune unchanged userdata keys
                for (key in val) {
                    // easiest is to use ==, this "feature" shouldn't exist
                    // anyway so might as well make it suck
                    if (val[key] == cmd.userdata[key]) {
                        delete val[key];
                    }
                    // ps the problem is not == semantics but the untypedness of
                    // the userdata field. YAY JAVASCRIPT. har dee friggin har.
                }
                // (client-side) special case for updating userdata: extend
                req.value = $.extend({}, cmd.userdata, updata.userdata);
                // TODO: more sanitation for fail-fast (not security obviously)
                break;
            case "stdoutScrollback":
            case "stderrScrollback":
            case "stdoutto":
            case "stderrto":
                if (!(U.isInt(val) && val >= 0)) {
                    throw new Error("illegal value for " + key + ": " + val);
                }
                if (val === cmd[key]) {
                    return;
                }
                break;
            case "name":
            case "cmd":
                if (!U.isString(val)) {
                    throw new Error("illegal value for " + key + ": " + val);
                }
                if (val === cmd[key]) {
                    return;
                }
                break;
            default:
                throw new Error("updating illegal prop: " + key);
            }
            reqs.push(req);
        });
        // only after every update is acknowledged may the callback run
        var updatecount = reqs.length;
        if (callback) {
            if (updatecount > 0) {
                $(cmd).on('callback.' + callbackId, function (e) {
                    var cmd = this;
                    updatecount -= 1;
                    if (updatecount == 0) {
                        callback(cmd, by);
                        $(cmd).off(e);
                    }
                });
            } else {
                // short-circuit
                callback(cmd);
            }
        }
        reqs.forEach(function (req) {
            cmd.ctrl.send('setprop', JSON.stringify(req));
        });
        // TODO: just to be clear about this: this whole counting callback thing
        // is a friggin' mess. what needs to be done, obviously, is a setprops
        // ws event, unifying the old updatecmd feature for updating multiple
        // props at once as well as allowing for a userdata context on the event
        // itself.
        // edit: actually, this screams json diff. there are probably a
        // gazillion jsondelta libs out there, esp for JS. would be nice to just
        // use that instead of reinventing the wheel.
    }

    // A new parent has been set, or current parent unset.
    processSetParent(newparent: Command) {
        var cmd = this;
        var oldparent = cmd.getParentCmd();
        if (newparent === null && oldparent === undefined) {
            throw new Error("Unsetting parent of root");
        }
        if (oldparent !== undefined) {
            cmd.parentId = undefined;
            cmd.trigger(new ParentRemovedEvent(oldparent));
        }
        // not else if because not mutually exclusive
        if (newparent !== null) {
            cmd.parentId = newparent.nid;
            cmd.trigger(new ParentAddedEvent(newparent));
        }
    }

    getArgv(): string[] {
        var argv: string[] = [this.cmd];
        argv.push.apply(argv, this.args);
        return argv;
    }

    start(): void {
        var cmd = this;
        if (cmd.cmd == "cd") {
            // TODO: This should be a different type, not Command but
            // ShellInstruction. Along with export, for example.
            var dir = cmd.args.length > 0 ? cmd.args[0] : "";
            cmd.ctrl.send('chdir', dir);
            // not really a command: releasing is the best we can do to prevent
            // weird feedback to user ("repeat?")
            cmd.release();
        } else if (cmd.cmd == "exit") {
            // TODO again! dude this is NOT the time nor the place!
            cmd.ctrl.send('exit');
            cmd.release();
        } else {
            cmd.ctrl.send('start', ''+cmd.nid);
        }
    }

    stop(): void {
        var cmd = this;
        cmd.ctrl.send('stop', ''+cmd.nid);
    }

    release(): void {
        var cmd = this;
        if (cmd.stdoutto || cmd.stderrto) {
            throw new Error("Cannot release command with child nodes");
        }
        cmd.ctrl.send('release', ''+cmd.nid);
    }

    // Delete command tree bottom-up.
    releaseGroup(): void {
        var cmd = this;
        cmd.mapTree(function (cmd) {
            var d = $.Deferred();
            // when the command is released, continue to parent
            cmd.on(WasReleasedEvent, () => d.resolve());
            // stdoutto must be unset, or releasing will fail
            cmd.update({stdoutto: 0}, undefined, () => cmd.release());
            return d;
        }, true);
    }

    private wasReleased = false;

    // called by the control stream when the server indicated that this command
    // was released. generates the jquery 'wasreleased' event on this command
    // object and removes many internal references to make the object unusable.
    processRelease(): void {
        var cmd = this;
        // jQuery event handlers no longer needed: unbind
        cmd.trigger(new WasReleasedEvent());
        $(cmd).off();
        // custom props
        delete cmd._moi;
        delete cmd.ee;
        delete cmd.parentId;
        // command props
        delete cmd.args;
        delete cmd.cmd;
        delete cmd.ctrl;
        delete cmd.cwd;
        delete cmd.god;
        delete cmd.htmlid;
        delete cmd.name;
        delete cmd.startwd;
        delete cmd.status;
        delete cmd.stderr;
        delete cmd.stderrScrollback;
        delete cmd.stderrto;
        delete cmd.stdout;
        delete cmd.stdoutScrollback;
        delete cmd.stdoutto;
        delete cmd.userdata;
        // Leave this one in for debugging
        //delete cmd.nid;
        cmd.wasReleased = true;
    }

    // Called by control stream object (ctrl) when the command generated data
    // on one of its output streams (stdout / stderr). Generates a jQuery
    // event in the 'stream' namespace, name is equal to the stream
    processStream(stream: string, data: string): void {
        var cmd = this;
        switch (stream) {
        case "stdout":
            cmd.trigger(new StreamStdoutEvent(data));
            break;
        case "stderr":
            cmd.trigger(new StreamStderrEvent(data));
            break;
        default:
            throw new Error("Unknown stream name: " + stream);
        }
    }

    // all commands that this command is a parent of.
    children(): Command[] {
        var cmd = this;
        var children: Command[] = [];
        var c = cmd.stdoutCmd();
        if (c !== undefined) {
            children.push(c);
        }
        c = cmd.stderrCmd();
        if (c !== undefined) {
            children.push(c);
        }
        return children;
    }

    isRoot(): boolean {
        var cmd = this;
        return !cmd.parentId;
    }

    stdoutCmd(): Command {
        var cmd = this;
        if (cmd.stdoutto) {
            return globals.cmds[cmd.stdoutto];
        }
    }

    stderrCmd(): Command {
        var cmd = this;
        if (cmd.stderrto) {
            return globals.cmds[cmd.stderrto];
        }
    }

    getParentCmd(): Command {
        var cmd = this;
        if (cmd.parentId) {
            return globals.cmds[cmd.parentId];
        }
    }

    getGid(): number {
        var cmd = this;
        if (cmd.isRoot()) {
            return cmd.nid;
        } else {
            return cmd.getParentCmd().getGid();
        }
    }

    mapTree(f: (c: Command) => any, reverse?: boolean): Promise<void> {
        return U.mapf(f, this, c => c.stdoutCmd(), reverse);
    }

    // serialize a pipeline
    cmdChainToPrompt() {
        var argvs:string[] = [];
        this.mapTree(function (cmd) {
            var argv = cmd.getArgv().map(U.parserEscape);
            argvs.push.apply(argvs, argv);
            if (cmd.stdoutto > 0) {
                argvs.push('|');
            }
        });
        return argvs.join(' ');
    }
}
