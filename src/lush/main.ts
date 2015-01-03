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

// Scripting for root page
//
// general idea:
//
// COMMAND OBJECTS
//
// commands are represented in the array globals.cmds as Command instances (see
// Command.js). These instances are always called "cmd" when assigned to a
// variable. They are the M in MVC. Or MVVM. I still get confused. Well
// definitely not 100% MVVM because holy shit have you read those msdn docs? Are
// they high? It's like they think we have infinite mental RAM or something.
// Yeah, sure! Four different files for one checkbox! Why not?
//
// WIDGETS
//
// thats what I call those small cmd boxes that represent a command in the UI
//
// CONTROL STREAM
//
// This script opens a websocket connection to /ctrl where the client and
// server talk to eachother about food and fashion and larry king. shockingly,
// there is no spec for this. check out websocket.go for the messages that the
// server can handle. Check out every line of every .js file to see what
// messages the client can handle. Or grep $(ctrl).on in this file thats
// probably easier. See Ctrl.js for details. In code. Haha what you thought in
// documentation?
//
// Note that websocket messages are broadcasted to every connected client.
// There is no request/reply system even though it does look like that it's
// slightly different. This is mostly relevant when you have multiple connected
// clients.
//
// Eg when you want to get the path. You say "getpath", but the server doesnt
// really reply with the path. okay it kinda does but this is about the idea
// with me here.
//
// what it does is send "This
// is the path: " message to all clients. the server can do that whenever
// it wants, for whatever reason. it HAPPENS to only do it when a client
// requests it or when the path changes, but the client doesnt treat it that
// way. what it does is whenever the "path" websocket message comes in (look
// for $(ctrl).on("path", ...)) it updates the entire UI with this new path.
// THEN it says "hey server send me the path" ("getpah"), knowing that when it
// does, the handling of the response is in place.
//
// so basically instead of this (in order of execution):
//
// 1 ask question
// 2 get answer
// 3 handle answer
//
// the code does this:
//
// 1 handle answer ($(ctrl).on(...))
// 2 ask question (ctrl.send())
// 3 get answer
//
// the path example is simplest but a lot of command related messaging also
// works this way. this helps in making the whole thing asynchronous and also
// easily scales to > 1 clients; when you get an answer you handle it, even if
// you didn't ask a question.
//
//
// EVENTS
//
// sooo im not really in the mood for writing documentation atm but this event
// pubsub thing (I think its pubsub but tbh the only thing I know about pubsub
// is what it stands for anyway judging from that I think this is pubsub :P) is
// getting out of hand i really need to write this down somewhere.
//
// soooooo.... ah yes there are loads of events flying around: websocket events
// and jquery events. this part is about the latter.
//
// window
//
//     there is one event that is triggered on the window object, it's the
//     newcmdcallback. i don't feel like explaining it here but you can search
//     the code for window.*on (and skip this sentence haha) and that should
//     explain it
//
// ctrl
//
//     all incoming websocket events are translated by the control object
//     (often (hopefully always) referred to by a var named ctrl) into jquery
//     events on itself. this part is pretty obvious and you can see how it
//     works by checking out Ctrl.js and searching for ctrl.*on in other parts
//     of the code.
//
// cmd
//
//     the command object also generates jquery events of its own. they are
//     used by Viewers to subscribe to updates of the Model. these are detailed
//     in the documentation of the Command class. (I'm actually quite proud of
//     that hand-rolled MV system please do check out Command.js :D)
//
//
// good luck.

/// <reference path="refs/es6-promise.d.ts"/>
/// <reference path="refs/jquery.d.ts"/>
/// <reference path="refs/jqueryui.d.ts"/>

import $ = require("jquery");
import jqueryui = require("jquery-ui");
// prevent tsc from removing unused imports to safeguard dependency when
// bundling
var _: any = jqueryui;

import CmdConfig = require("./CmdConfig");
import Command = require("./Command");
import Ctrl = require("./Ctrl");
import HistoryWidget = require("./HistoryWidget");
import globals = require("./globals");
import path = require("./path");
import terminal = require("./terminal");
import U = require("./utils");
import Widget = require("./Widget");

// Reference to the history widget (needed for command initialization)
var historyWidget: HistoryWidget;

// print text to this terminal's output and mark it as coming from this
// command. sets a class in the div that holds the output in the terminal.
function termPrintlnCmd(term, sysid: number, data: string) {
    var finalize = function (container) {
        container.addClass('output-' + sysid);
    };
    return term.termPrintln(data, finalize);
}

// ask the server to create a new command. if second argument is passed, it is
// called with the new command as the argument once the server responds
function processCmd(options, callback?: (c: Command.Command) => {}) {
    // ensure userdata is an object (rest of the code depends on this)
    if (!$.isPlainObject(options.userdata)) {
        options.userdata = {};
    }
    if (!options.hasOwnProperty('stdoutScrollback')) {
        options.stdoutScrollback = 1000;
    }
    if (!options.hasOwnProperty('stderrScrollback')) {
        options.stderrScrollback = 1000;
    }
    options.userdata.god = globals.moi;
    if (callback !== undefined) {
        // subscribe to the "newcmdcallback" event in a unique namespace. every
        // new command will trigger the "newcmdcallback" event (without
        // namespace), which will trigger all callbacks, including this one.
        var cbid = 'newcmdcallback.' + U.guid();
        options.userdata.callback = cbid;
        $(window).on(cbid, function (e, cmd: Command.Command) {
            if (cmd === undefined) {
                console.log('new commmand callback time-out: ' + JSON.stringify(options));
                $(window).unbind(e);
                // TODO: inform the callback about timeout
            }
            // namespaced jquery event, can be triggered spuriously.  make sure
            // that this command corresponds to this callback.
            else if (cmd.userdata.callback == cbid) {
                callback(cmd);
                $(window).unbind(e); // make the timeout trigger a NOP
            }
        });
        // clear the callback after ten seconds. this means that the server has
        // ten seconds to generate a newcmd event, which will trigger the
        // newcmdcallback event. after that, the callback is deleted.
        setTimeout(function () {
            // clearing is done by triggering the event without a cmd object.
            // the handler will then unhook itself.
            $(window).trigger(cbid);
            // wish I could assert($(window).handlers(cbid).length == 0)
        }, 10000);
    }
    globals.ctrl.send("new", JSON.stringify(options));
}

// Handle what comes after the # on page load
function processHash(h, term) {
    var i = h.indexOf(';');
    var rest = h.slice(i + 1);
    switch (h.slice(0, i)) {
    case "prompt":
        term.set_command(rest);
    }
}

// ask the server to connect these two commands
function requestConnect(srcid, trgtid, stream, ctrl: Ctrl.Ctrl) {
    var options = {
        from: srcid,
        to: trgtid,
        stream: stream,
    };
    ctrl.send('connect', JSON.stringify(options));
}

// Model initialization of a command given its initialization data.  Throws
// an exception if its children are not initialized. Does NOT initialize the
// view or controllers (Widget and HistoryWidget).
function initCommandModel(init): Command.Command {
    if (!$.isPlainObject(init)) {
        throw new Error("init data must be a plain object");
    }
    if (init.stdoutto && !(init.stdoutto in globals.cmds)) {
        throw new Error("initializing " + init.nid + " before its stdout child");
    }
    if (init.stderrto && !(init.stderrto in globals.cmds)) {
        throw new Error("initializing " + init.nid + " before its stderr child");
    }

    var cmd = new Command.Command(globals.ctrl, init, globals.moi);
    // Generating these events as part of init, out of normal event flow, feels
    // ugly. In this particular case, it's acceptable: the Command constructor
    // does not know anything about parents, it always assumes it is root and
    // that all its children exist. It will not require any external triggering
    // of events for initialisation. However, adding a new command as its
    // parent is not considered initialisation of the child command. This is a
    // compromise between keeping the Command constructor clean vs the rest.
    [cmd.stdoutCmd(), cmd.stderrCmd()].filter(U.identity).forEach(function (child) {
        child.processSetParent(cmd);
    });
    globals.cmds[cmd.nid] = cmd;
    return cmd;
}

// Get this command's init data synchronously
function getInitData(nid) {
    var init;
    var err;
    var url = '/' + nid + '.json'
    $.ajax(url, {
        async: false,
        success: function (data) {
            init = data;
        },
        error: function (_, textStatus, errorThrown) {
            console.log("Retrieving " + url + " failed: " + textStatus);
            err = errorThrown || textStatus;
        },
    });
    if (undefined !== err) {
        throw err;
    }
    return init;
}

function sortArray(ar: number[]): number[] {
    // oh my god javascript-dev what are you guys doing?
    return ar.sort(function (a, b) {
        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        }
        return 0;
    });
}

function isNumericalArray(obj): boolean {
    return $.isArray(obj) && obj.every(U.isInt);
}

// Array of all currently existing command IDs
function getCmdIds(): Promise<number[]> {
    return new Promise<number[]>(function (ok, bad) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/cmdids.json');
        xhr.responseType = 'json';
        xhr.onload = function () {
            if (xhr.status !== 200) {
                var errmsg = 'XHR error: ' + xhr.status + ' ' + xhr.statusText;
                bad(new Error(errmsg));
                return;
            }
            ok(xhr.response);
        };
        xhr.onerror = function () {
            bad(new Error("XHR error: GET /cmdids.json failed"));
        };
        xhr.send();
    }).then(function (data): any {
        if (!isNumericalArray(data)) {
            console.error("Expected numerical array from /nids.json, got: " +
                JSON.stringify(data));
            return Promise.reject(new Error("Received illegal response"));
        }
        return data;
    }).then(sortArray);
}

function getCtrlKey(ctrlurl: string): Promise<string> {
    return new Promise<string>(function (ok, bad) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', ctrlurl);
        xhr.onload = function () {
            if (xhr.status !== 200) {
                var errmsg = 'XHR error: ' + xhr.status + ' ' + xhr.statusText;
                bad(new Error(errmsg));
                return;
            }
            ok(xhr.response);
        };
        xhr.onerror = function () {
            bad(new Error('XHR error: GET ' + ctrlurl + ' failed'));
        };
        xhr.send();
    });
}

// Initialize the model of this command and all its children. Idempotent.
// Init data is fetched from the server.
// TODO: I don't like the naming + this arg being the nid, and the other
// non-recursive function initCommandModel accepting init data.
function initCommandTreeModel(nid: number): Command.Command {
    if (nid in globals.cmds) {
        return globals.cmds[nid];
    }
    var init = getInitData(nid);
    var children: Command.Command[] = [];
    if (init.stdoutto) {
        children.push(initCommandTreeModel(init.stdoutto));
    }
    if (init.stderrto) {
        children.push(initCommandTreeModel(init.stderrto));
    }
    return initCommandModel(init);
}

// Init the view (and controller) for this command only.
function initCommandView(cmd: Command.Command): Command.Command {
    if (document.getElementById('root' + cmd.nid) !== null) {
        throw new Error("View already initialized for " + cmd.htmlid);
    }
    Widget(cmd, document.getElementById("cmds"));
    historyWidget.addCommand(cmd);
    return cmd;
}

function initCommands(nids: number[]) {
    if (historyWidget === undefined) {
        throw new Error("history widget must be defined before initialization");
    }
    nids.map(initCommandTreeModel)
        .filter(c => c.isRoot())
        .forEach(c => c.mapTree(initCommandView, true));
}

function selectCommand(nid: number, confwin: CmdConfig) {
    $('.selected').removeClass('selected');
    $('#cmd' + nid).addClass('selected');
    confwin.associateCmd(globals.cmds[nid]);
}

// remove all commands that are not owned by any of the active clients (active
// client list passed as an array).
function pruneStalePreparedCommands(activeClients: number[]) {
    if (!$.isArray(activeClients)) {
        throw new Error("pruneStalePreparedCommands requires array of active clients");
    }
    // require set access
    var clients = {};
    activeClients.forEach(nid => clients[nid] = 58008);
    $.each(globals.cmds, function (_, cmd: Command.Command) {
        // someone left an unused prepared command lying around
        if (cmd.userdata.creator == "prompt" &&
            cmd.userdata.unused &&
            !(cmd.userdata.god in clients))
        {
            cmd.release();
        };
    });
}

// the server said that there is a new command
function processNewCmdEvent(ctrl, init) {
    var cmd = initCommandView(initCommandModel(init));
    if (cmd.imadethis()) {
        // i made this!
        // capture all stdout and stderr to terminal
        var printer = function (e) {
            var data = e.data;
            termPrintlnCmd(globals.terminal, cmd.nid, data);
        };
        var offs = {
            stdout: cmd.on(Command.StreamStdoutEvent, printer),
            stderr: cmd.on(Command.StreamStderrEvent, printer)
        };
        cmd.on(Command.ChildAddedEvent, function (e: Command.ChildAddedEvent) {
            var stream = e.streamname;
            offs[stream]();
            delete offs[stream];
        });
        cmd.on(Command.ChildRemovedEvent, function (e: Command.ChildRemovedEvent) {
            var stream = e.streamname;
            if (e.streamname === 'stdout') {
                offs.stdout = cmd.on(Command.StreamStdoutEvent, printer);
            } else {
                offs.stderr = cmd.on(Command.StreamStderrEvent, printer);
            }
        });
        // subscribe to stream data
        ctrl.send('subscribe', cmd.nid, 'stdout');
        ctrl.send('subscribe', cmd.nid, 'stderr');
        // trigger all callbacks waiting for a newcmd event
        $(window).trigger('newcmdcallback', cmd);
    }
}

// server is ready: init client. Asks a lot of data as parameters to avoid race
// conditions while setting up different modules. E.g. CLI module will prefetch
// some commands, which interferes with the list of existing command ids. If
// that is done in the wrong order some commands will be doubly initialized.
// Asking that list as a parameter here ensures order is proper. Bonus: allows
// parallel fetching of all initialization data in the init routine.
function main_aux(ctrl: Ctrl.Ctrl, moi: string, existingCmdIds: number[]) {
    globals.ctrl = ctrl;
    globals.moi = moi;
    var term = terminal(document.getElementById('terminal'), processCmd, ctrl);
    globals.terminal = term;
    var confwin = new CmdConfig();
    historyWidget = new HistoryWidget();
    // turn DOM node's ID into a numerical one (strip off leading "cmd")
    function getNidFromNode(node) {
        return +(/\d+$/.exec(node.id)[0]);
    }
    // this... well this is just a doozie. or it helps you getting the group ID
    // (i.e. nid of the root cmd) of the pipeline that the button element (arg)
    // belongs to.
    function getGidFromCtrlButton(node) {
        return getNidFromNode(node.parentNode.parentNode);
    }
    // associate clicked command widget with confwin
    $('#cmds').assertNum(1).on('click', '.cmdwidget', function (e) {
        e.stopPropagation();
        var nid = getNidFromNode(this);
        selectCommand(nid, confwin);
    }).on('click', 'button.repeatgroup', function (e) {
        // set prompt to this pipeline's textual representation
        e.preventDefault();
        var cmd = globals.cmds[getGidFromCtrlButton(this)];
        term.set_command(cmd.cmdChainToPrompt()).focus();
        return false;
    }).on('click', 'button.startgroup', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var cmd = globals.cmds[getGidFromCtrlButton(this)];
        function isCmdStarted(cmd: Command.Command) {
            return cmd.status.code > 0;
        }
        cmd.mapTree(function (cmd) {
            if (!isCmdStarted(cmd)) {
                cmd.start()
            }
        });
    }).on('click', 'button.archivegroup', function (e) {
        e.preventDefault();
        // don't bubble to prevent invoking the "activate command" handler
        e.stopPropagation();
        globals.cmds[getGidFromCtrlButton(this)].setArchivalState(true);
    }).on('click', 'button.releasegroup', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var cmd = globals.cmds[getGidFromCtrlButton(this)];
        cmd.releaseGroup();
    }).on('click', '.rootcontainer', function (e) {
        e.stopPropagation();
        // clicking in the general container area activates the first command
        $(this).find('> .groupwidget > .cmdwidget').assertNum(1).click();
    });
    $(ctrl).on('error', function (e, json) {
        var msg = JSON.parse(json);
        term.error(msg);
    });
    $('button#newcmd').click(function () {
        // create an empty command
        processCmd({});
    });
    $('.sortable').disableSelection().sortable();
    // a new command has been created
    $(ctrl).on("newcmd", function (e, cmdjson) {
        var ctrl = this;
        var init = JSON.parse(cmdjson);
        processNewCmdEvent(ctrl, init);
    });
    // the property of some object was changed
    $(ctrl).on("property", function (_, propdataJson) {
        var propdata = JSON.parse(propdataJson);
        var match = /^cmd(\d+)/.exec(propdata.name);
        if (match) {
            // it is a command property
            var cmd = globals.cmds[+match[1]];
            if (cmd) {
                cmd.processUpdateResponse(propdata);
            } else {
                console.log("property for unknown command: " + propdata);
            }
        }
    });
    $(ctrl).on("cmd_released", function (_, idstr) {
        var nid = +idstr;
        var cmd = globals.cmds[nid];
        cmd.processRelease();
        delete globals.cmds[nid];
    });
    // Every new client prunes the list of pooled commands, removing commands
    // that were greedily prepared by clients that have disconnected without
    // cleaning up their mess (you naughty clients you). Prune only once to
    // prevent concurrent pruning when multiple clients connect.
    //
    // Still race sensitive if another client connects while this one is not
    // done pruning. TODO I guess. :(
    $(ctrl).one("allclients", function (_, payload) {
        var activeClients = JSON.parse(payload);
        pruneStalePreparedCommands(activeClients);
    });
    path.initPathUI($('form#path'), ctrl);
    if (window.location.hash) {
        processHash(window.location.hash.slice(1), term);
    }
    // proxy the stream event to the command object comes in as:
    // stream;1;stdout;foo bar the normal event handling causes the 'stream'
    // event to trigger that's this one. this handler will proxy that event to
    // the command object's processStream method.
    $(ctrl).on('stream', function (_, rawopts) {
        var opts = U.splitn(rawopts, ';', 3);
        var sysid = opts[0];
        var stream = opts[1];
        var data = opts[2];
        globals.cmds[sysid].processStream(stream, data);
    });
    // click on a <a data-toggle-class="foo" href="#lala"> toggles class foo on
    // <p id=lala> 
    $('[data-toggle-class]').click(function (e) {
        e.preventDefault();
        var clsName = this.dataset.toggleClass;
        var targetSelector = this.dataset.target || $(this).attr('href');
        $(targetSelector).toggleClass(clsName);
    });
    $("#left").tabsBottom();
    // I hate this class
    $('.ui-widget').removeClass('ui-widget');
    initCommands(existingCmdIds);
    document.body.dataset['status'] = 'ok';
}

function lushMain(ctrlurl) {
    if (typeof ctrlurl !== "string") {
        throw new Error("invalid argument for lush: requires url of control stream");
    }
    var ctrlPromise = getCtrlKey(ctrlurl).then(function (ctrlKey: string) {
        // Control stream (Websocket)
        return new Ctrl.WebsocketCtrl(ctrlurl, ctrlKey);
    });
    var myidPromise: Promise<number> = ctrlPromise.then(function (ctrl: Ctrl.Ctrl) {
        return new Promise<number>(function (ok) {
            $(ctrl).one('clientid', function (_, myid) {
                ok(myid);
            });
        });
    });
    Promise.all([ctrlPromise, myidPromise, getCmdIds()]).then(function (values: any[]) {
        main_aux.apply(this, values);
    }, function (err) {
        console.error("Failed to get initialization data: " + err.message);
        console.log(err);
    });
}

export = lushMain;
