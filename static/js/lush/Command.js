// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

"use strict";


// command object synchronized with server. the properties of this object are
// not spec'ed but they should be. instead they are implementation defined, by
// the serialization of a server-side command object to JSON (metacmd.go).
// still, they should be treated as if that is the spec, the client is not
// supposed to start adding all kinds of new properties (use the userdata
// property for custom client data).
//
// the following jquery events can be subscribed to on an instance of this
// class:
//
// - updated: triggered when the command object has been updated. is triggered
// in the namespace of an updated property. e.g. the name member has been set to
// "foo": you get an 'updated.name' event. The new value can be extracted
// directly from the command object. The first parameter to the event is a
// string identifying who generated the event.
//
// - wasreleased: triggered when resources associated with a command have been
// released by the server and the client wants to clean up the command. any
// resources that will not be garbage collected automatically should be freed
// here.
//
// - stdout.stream / stderr.stream: called when the running command is
// generating data on the relevant streams.
//
// - archival: triggered when this command is being (un)archived. can be caused
// by a server event, by the user minimizing the widget, or by a parent widget
// being minimized. should not be propagated by registered handlers (is
// propagated by the Command object). the parameter is a boolean that is true
// for archiving, false for unarchiving.
//
// - parentRemoved: this command is now a root. the argument is the old parent.
//
// - parentAdded: the argument is the new parent. note that commands can only
// have one parent.
//
// - childAdded: an output pipe of this command is now connected to another
// command. the first parameter is the child, the second is the name of the
// stream.
//
// - childRemoved: an output pipe is disconnected from a command. the first
// parameter is the command that was disconnected, the second is the name of
// the stream.
//
// - done: the status is updated from active to either success or error. the
// status object is passed as the argument. automatically unbinds all events
// that can now not happen anymore, including itself.
//
// TODO: This should be a Deferred object not an Event, for obvious reasons

define(["jquery", "lush/utils"], function ($, U) {

    // third arg is a uuid identifying this session
    var Command = function (ctrl, init, moi) {
        var cmd = this;
        if (ctrl === undefined || init === undefined || moi === undefined) {
            throw "Command constructor requires three parameters";
        }
        if (init.nid === undefined) {
            throw "Init data must contain .nid field";
        }
        cmd.ctrl = ctrl;
        cmd._moi = moi;
        $.extend(cmd, init);
        /* default values for properties */
        if (!cmd.userdata) {
            cmd.userdata = {};
        }
        if (cmd.args === undefined) {
            cmd.args = [];
        } else if (!$.isArray(cmd.args)) {
            throw "command must have an array as argument list";
        }
        // stock event handlers
        $(cmd).on('parentAdded', function (_, dad) {
            var cmd = this;
            cmd.parentId = dad.nid;
        });
        $(cmd).on('parentRemoved', function () {
            var cmd = this;
            cmd.parentId = undefined;
        });
        /*
         * Disabled because some UI elements rely on these events for
         * initialization. The whole situation is a mess and these events should
         * be on their way out anyway. Disabling as a temporary work-around.
         * Helloooo memory leaks.
         */
        //$(cmd).on('done', function () {
        //    var cmd = this;
        //    // these event handlers only make sense for running commands
        //    // TODO: this list is bound to grow out of sync. How to fix?
        //    $(cmd).off('.stream childAdded childRemoved parentAdded parentRemoved done updated.status updated.args updated.cmd');
        //});
        $(cmd).on('updated.status', function (e) {
            var cmd = this;
            if (cmd.status.code > 1) {
                $(cmd).trigger('done', cmd.status);
                $(cmd).off(e); // no need for me anymore
            }
        });
        $(cmd).on('stdout.stream', function (_, data) {
            var cmd = this;
            cmd.stdout += data;
            $(cmd).trigger('updated.stdout', [cmd.stdout]);
        });
        $(cmd).on('stderr.stream', function (_, data) {
            var cmd = this;
            cmd.stderr += data;
            $(cmd).trigger('updated.stderr', [cmd.stderr]);
        });
        if (cmd.stdoutto) {
            var child = cmd.stdoutCmd();
            // This is fucking terrible. Excuse the swearing but it truly is,
            // it's a mess. Triggering this event before initialization
            // completes is a disaster; callbacks will now fire, assuming the
            // parent is ready, which it's not. E.g. it's not in cmds[] array
            // yet, so child.getParentCmd() will fail, and thus so will
            // getGid(). This is absolutely hopeless and I am deeply deeply
            // ashamed. In dire, DIRE need of a rewrite. Simplification, static
            // typing, removal of these jquery events (use normal, typesafe
            // events on this object itself), the whole shebang.
            //
            // This.
            //
            // Is.
            //
            // A.
            //
            // Disaster.
            $(child).trigger('parentAdded', [cmd]);
        }
        if (cmd.stderrto) {
            var child = cmd.stderrCmd();
            $(child).trigger('parentAdded', [cmd]);
        }
    };

    Command.prototype.imadethis = function () {
        var cmd = this;
        return cmd._moi && cmd._moi == cmd.userdata.god;
    }

    // update the state of archival on the server
    Command.prototype.setArchivalState = function (state) {
        var cmd = this;
        cmd.update({userdata: {archived: state}});
    }

    function makeChildModObject(fromid, toid) {
        return {
            from: cmds[fromid],
            to: cmds[toid],
        };
    }

    Command.prototype.processUpdate = function (response) {
        var cmd = this;
        var prop = response.prop;
        var value = response.value;
        var updatedby, callbackId;
        if (response.userdata) {
            updatedby = response.userdata.by;
            callbackId = response.userdata.callback;
        }
        // Track modifications to hierarchy for appropriate event raising later
        // map(streamname => map({from, to} => [Command | null]))
        var childMod = {};
        if (prop == "stdoutto") {
            childMod.stdout = 
                makeChildModObject(cmd.stdoutto, value);
        } else if (prop == "stderrto") {
            childMod.stderr = 
                makeChildModObject(cmd.stderrto, value);
        }
        var archivalStateChanged = (
                prop == "userdata" &&
                value.archived !== undefined &&
                value.archived !== cmd.userdata.archived);
        cmd[prop] = value;
        // per-property update event
        $(cmd).trigger('updated.' + prop, [updatedby]);
        // trigger child/parent add/remove event if relevant
        $.map(childMod, function (mod, stream) {
            if (mod.from !== undefined) {
                $(mod.from).trigger('parentRemoved', [cmd, stream]);
                $(cmd).trigger('childRemoved', [mod.from, stream]);
            }
            if (mod.to !== undefined) {
                $(mod.to).trigger('parentAdded', [cmd, stream]);
                $(cmd).trigger('childAdded', [mod.to, stream]);
            }
        });
        if (archivalStateChanged) {
            // if the server tells me that I've been (de)archived, generate an
            // "archival" jQuery event
            if (!cmd.isRoot()) {
                throw "Received archival event on non-root node " + cmd.nid;
            }
            $(cmd).trigger('archival', value.archived);
        }
        if (callbackId) {
            $(cmd).trigger('callback.' + callbackId);
        }
    };

    function isInt(n) {
        return (typeof n === "number") && n % 1 === 0;
    }

    function isNonNegativeInt(n) {
        return isInt(n) && n >= 0;
    }

    function isString(x) {
        return typeof x === "string";
    }

    function arraysEqual(ar1, ar2) {
        if (!$.isArray(ar1) || !$.isArray(ar2)) {
            throw "arraysEqual requires two array arguments";
        }
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

    function allTrue(ar) {
        for (el in ar) {
            if (!el) {
                return false;
            }
        }
        return true;
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
    Command.prototype.update = function (updata, by, callback) {
        var cmd = this;
        if (by !== undefined && typeof by != "string") {
            throw "by argument must be a string";
        }
        if (callback !== undefined && !$.isFunction(callback)) {
            throw "callback argument must be a function";
        }
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
                    throw "args must be an array, is: " + val;
                }
                if (!allTrue(val.forEach(isString))) {
                    throw "every member of args must be a string";
                }
                if (arraysEqual(cmd.args, val)) {
                    return;
                }
                break;
            case "userdata":
                if (!$.isPlainObject(val)) {
                    throw "userdata must be a plain object, is: " + val;
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
                if (!isNonNegativeInt(val)) {
                    throw "illegal value for " + key + ": " + val;
                }
                if (val == cmd[key]) {
                    return;
                }
                break;
            case "name":
            case "cmd":
                if (!isString(val)) {
                    throw "illegal value for " + key + ": " + val;
                }
                if (val == cmd[key]) {
                    return;
                }
                break;
            default:
                throw "updating illegal prop: " + key;
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
    };

    // DEPRECATED because using update with a zero value simplifies the code
    Command.prototype.delprop = function (propname, by) {
        var cmd = this;
        console.log("DEPRECATED: Command.delprop (use update to zero-value)");
        var req = {
            name: cmd.htmlid,
            prop: propname,
            userdata: by,
        };
        cmd.ctrl.send('delprop', JSON.stringify(req));
        return;
    };

    Command.prototype.getArgv = function () {
        var argv = [this.cmd];
        argv.push.apply(argv, this.args);
        return argv;
    };

    Command.prototype.start = function () {
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
            cmd.ctrl.send('start', cmd.nid);
        }
    };

    Command.prototype.stop = function () {
        var cmd = this;
        cmd.ctrl.send('stop', cmd.nid);
    };

    Command.prototype.release = function () {
        var cmd = this;
        if (cmd.stdoutto || cmd.stderrto) {
            throw "Cannot release command with child nodes";
        }
        cmd.ctrl.send('release', cmd.nid);
    };

    // called by the control stream when the server indicated that this command
    // was released. generates the jquery 'wasreleased' event on this command
    // object.
    Command.prototype.processRelease = function () {
        var cmd = this;
        // jQuery event handlers no longer needed: unbind
        $(cmd).trigger('wasreleased').off();
        delete cmd.cmd;
        delete cmd.args;
        delete cmd.userdata;
        delete cmd._moi;
        delete cmd.ctrl;
    };

    // Called by control stream object (ctrl) when the command generated data
    // on one of its output streams (stdout / stderr). Generates a jQuery
    // event in the 'stream' namespace, name is equal to the stream
    Command.prototype.processStream = function (stream, data) {
        $(this).trigger(stream + '.stream', [data]);
    }

    // The child of this command on the given stream or undefined if none
    Command.prototype.child = function (stream) {
        var toid = this[stream + 'to'];
        if (toid !== undefined) {
            return cmds[toid];
        }
    };

    // all commands that this command is a parent of.
    Command.prototype.children = function () {
        var children = [];
        var c;
        c = this.child('stdout');
        if (c !== undefined) {
            children.push(c);
        }
        c = this.child('stderr');
        if (c !== undefined) {
            children.push(c);
        }
        return children;
    };

    Command.prototype.isRoot = function () {
        var cmd = this;
        return !cmd.parentId;
    };

    Command.prototype.stdoutCmd = function () {
        var cmd = this;
        if (cmd.stdoutto) {
            return cmds[cmd.stdoutto];
        }
    };

    Command.prototype.stderrCmd = function () {
        var cmd = this;
        if (cmd.stderrto) {
            return cmds[cmd.stderrto];
        }
    };

    Command.prototype.getParentCmd = function () {
        var cmd = this;
        if (cmd.parentId) {
            return cmds[cmd.parentId];
        }
    };

    Command.prototype.getGid = function () {
        var cmd = this;
        if (cmd.isRoot()) {
            return cmd.nid;
        } else {
            return cmd.getParentCmd().getGid();
        }
    };

    return Command;
});
