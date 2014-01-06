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

// Scripting for root page
//
// sorry for the mess
//
// general idea:
//
// COMMAND OBJECTS
//
// TODO: This is obsolete. check out Command.js
// commands are represented in the global array "cmds" as objects (usually
// called "cmd" when assigned to a variable). there is no spec on the
// properties in a cmd object (frowny face) but you can get the idea from a
// couple places:
//
// metacmd.go defines serialization of the cmd object from the server side.
// this is where a cmd object comes to life as a JSON object
//
// that json thing finds its way to the createCmdWidget function. there a
// widget is created and initialized for the command and some extra stuff is
// added to the cmd object like functions and more properties.
//
// sounds good to me what could possibly go wrong?
//
// WIDGETS
//
// thats what I call those draggable boxes that represent a command in the UI
//
// CONTROL STREAM
//
// this script opens a websocket connection to /ctrl where the client and
// server talk to eachother about food and fashion and larry king. shockingly,
// there is no spec for this, either. check out websocket.go for the messages
// that the server can handle. check out every line of every .js file to see
// what messages the client can handle. or grep $(ctrl).on in this file thats
// probably easier. see ctrl.js for details. in code. haha what you thought in
// documentation?
//
// Note that websocket messages are broadcasted to every connected client.
// There is no request/reply system even though it does look like that its
// slightly different. This is mostly relevant when you have multiple connected
// clients.
//
// Eg when you want to get the path. You say "getpath", but the server doesnt
// really reply with the path. okay it kinda does but this is about the idea
// bear (haha) (thats the lamest joke since the invention of paper) with me
// here.
//
// what it does is send (wow i still cant believe i made that bear joke) "This
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
// 1 handle answer (ctrl.handleEvent(...))
// 2 ask question (ctrl.send())
// 3 get answer
//
// that bear joke wasn't even a double meaning i just misspelled something and
// it happened to be another word. oh my god. hilarity.
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
//     works by checking out Control.js and searching for ctrl.*on in other
//     parts of the code.
//
// cmd
//
//     the command object also generates jquery events of its own. they are
//     used by Viewers to subscribe to updates of the Model. these are detailed
//     in the documentation of the Command class.
//
//
// good luck.

define(["jquery",
        "lush/Ctrl",
        "lush/Command",
        "lush/Widget",
        "lush/CmdConfig",
        "lush/HistoryWidget",
        "lush/terminal",
        "lush/path",
        "jsPlumb",
        "lush/utils"],
       function ($,
                 Ctrl,
                 Command,
                 Widget,
                 CmdConfig,
                 HistoryWidget,
                 terminal,
                 path) {

    // print text to this terminal's output and mark it as coming from this
    // command. sets a class in the div that holds the output in the terminal.
    var termPrintlnCmd = function (term, sysid, data) {
        var finalize = function (container) {
            container.addClass('output-' + sysid);
        };
        return term.termPrintln(data, finalize);
    };

    // ask the server to create a new command. if second argument is passed, it
    // is called with the new command as the argument once the server responds
    var processCmd = function (options, callback) {
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
            // subscribe to the "newcmdcallback" event in a unique
            // namespace. every new command will trigger the
            // "newcmdcallback" event (without namespace), which will
            // trigger all callbacks, including this one.
            var cbid = 'newcmdcallback.' + guid();
            options.userdata.callback = cbid;
            $(window).on(cbid, function (e, cmd) {
                if (cmd === undefined) {
                    console.log('new commmand callback time-out: ' + JSON.stringify(options));
                    $(window).unbind(e);
                    // TODO: inform the callback about timeout
                }
                // namespaced jquery event, can be triggered spuriously.
                // make sure that this command corresponds to this
                // callback.
                else if (cmd.userdata.callback == cbid) {
                    callback(cmd);
                    $(window).unbind(e); // make the timeout trigger a NOP
                }
            });
            // clear the callback after ten seconds. this means that the
            // server has ten seconds to generate a newcmd event, which
            // will trigger the newcmdcallback event. after that, the
            // callback is deleted.
            setTimeout(function () {
                // clearing is done by triggering the event without a cmd
                // object. the handler will then unhook itself.
                $(window).trigger(cbid);
                // wish I could assert($(window).handlers(cbid).length == 0)
            }, 10000);
        }
        globals.ctrl.send("new", JSON.stringify(options));
    };

    // Handle what comes after the # on page load
    var processHash = function (h, term) {
        var i = h.indexOf(';');
        var rest = h.slice(i + 1);
        switch (h.slice(0, i)) {
        case "prompt":
            term.set_command(rest);
        }
    };

    // ask the server to connect these two commands
    var requestConnect = function (srcid, trgtid, stream, ctrl) {
        var options = {
            from: srcid,
            to: trgtid,
            stream: stream,
        };
        ctrl.send('connect', JSON.stringify(options));
    };

    // "blabla123" -> int(123)
    function parseTrailingInteger(str) {
        return +(/\d+$/.exec(str)[0]);
    }

    // the user just connected two widgets
    function jsPlumbBeforeDropHandler(info) {
        if ($('#' + info.targetId).closest('.children').length != 0) {
            // TODO: log to user
            console.log("stdin of " + info.targetId + " already bound");
            return false;
        }
        var srcid = parseTrailingInteger(info.sourceId);
        var trgtid = parseTrailingInteger(info.targetId);
        var stream = info.connection.endpoints[0].getParameter("stream");
        requestConnect(srcid, trgtid, stream, globals.ctrl);
        // if server accepts, it will generate an event that will cause binding
        // in the UI. don't bind here.
        return false;
    }

    // complete initialization of a command given its nid. Expects
    // initialization data for this command and all possible child commands to
    // be in cmds_init. will also init all child commands.
    function initCommand(nid, historyw) {
        if (typeof nid !== "number") {
            throw "nid must be a number";
        }
        if (historyw === undefined) {
            throw "history widget must be defined";
        }
        var init = cmds_init[nid];
        if (init === undefined) {
            throw "No init data available for cmd " + nid;
        }
        // init children first
        if (init.stdoutto && !(init.stdoutto in cmds)) {
            initCommand(init.stdoutto, historyw);
        }
        if (init.stderrto && !(init.stderrto in cmds)) {
            initCommand(init.stderrto, historyw);
        }
        delete cmds_init[nid];
        var cmd = new Command(globals.ctrl, init, globals.moi);
        cmds[nid] = cmd;
        var widget = new Widget(cmd, globals.ctrl);
        historyw.addCommand(cmd);
        // some UI parts are not initialized, just hooked into updated handlers.
        // TODO: NOT MY PROBLEM -- or so I wish :( that should change
        $(cmd).trigger('updated', ['init']);
        $(cmd).trigger('archival', [!!cmd.userdata.archived]);
        return cmd;
    };

    function selectCommand(nid, confwin) {
        $('.selected').removeClass('selected');
        $('#cmd' + nid).addClass('selected');
        confwin.associateCmd(cmds[nid]);
    }

    // server is ready: init client. only this function may assign to globals.
    function main_aux(ctrl, moi) {
        globals.ctrl = ctrl;
        globals.moi = moi;
        var confwin = new CmdConfig();
        // associate clicked command widget with confwin
        $('#cmds').on('click', '.cmdwidget', function (e) {
            var nid = /\d+$/.exec(this.id)[0];
            selectCommand(+nid, confwin);
        }).on('click', 'button.archivegroup', function (e) {
            var gid = /\d+$/.exec(this.parentNode.id)[0];
            cmds[+gid].setArchivalState(true);
        });
        // jQuery terminal plugin object
        var term = terminal(processCmd, ctrl);
        var historyw = new HistoryWidget();
        // build the command objects without triggering update handlers
        $.each(cmds_init, function (nid) {
            nid = +nid;
            // parents automatically init children, don't reinit
            if (nid in cmds_init) {
                initCommand(nid, historyw);
            }
        });
        jsPlumb.importDefaults({
            ConnectionsDetachable: false,
            // Put all connectors at z-index 3 and endpoints at 4
            ConnectorZIndex: 3,
        });
        jsPlumb.bind("beforeDrop", jsPlumbBeforeDropHandler);
        $('button#newcmd').click(function () {
            // create an empty command
            processCmd({});
        });
        $('.sortable').disableSelection().sortable();
        // a new command has been created
        $(ctrl).on("newcmd", {historyw: historyw}, function (e, cmdjson) {
            var ctrl = this;
            var historyw = e.data.historyw;
            var init = JSON.parse(cmdjson);
            cmds_init[init.nid] = init;
            var cmd = initCommand(init.nid, historyw);
            if (cmd.imadethis()) {
                // i made this!
                // capture all stdout and stderr to terminal
                var printer = function (_, data) {
                    termPrintlnCmd(term, cmd.nid, data);
                };
                $(cmd).on('stdout.stream', printer);
                $(cmd).on('stderr.stream', printer);
                $(cmd).on('childAdded', function (e, child, stream) {
                    var cmd = this;
                    $(cmd).off(stream + '.stream');
                });
                $(cmd).on('childRemoved', function (e, child, stream) {
                    var cmd = this;
                    $(cmd).on(stream + '.stream', printer);
                });
                // subscribe to stream data
                ctrl.send('subscribe', cmd.nid, 'stdout');
                ctrl.send('subscribe', cmd.nid, 'stderr');
                // trigger all callbacks waiting for a newcmd event
                $(window).trigger('newcmdcallback', cmd);
            }
        });
        // the property of some object was changed
        $(ctrl).on("property", function (_, propdataJson) {
            var propdata = JSON.parse(propdataJson);
            var match = /^cmd(\d+)/.exec(propdata.name);
            if (match) {
                // it is a command property
                var cmd = cmds[match[1]];
                if (cmd) {
                    cmd.processUpdate(propdata);
                } else {
                    console.log("property for unknown command: " + propdata);
                }
            }
        });
        $(ctrl).on("cmd_released", function (_, idstr) {
            var nid = +idstr;
            var cmd = cmds[nid];
            cmd.processRelease();
            delete cmds[nid];
        });
        // Every new client prunes the list of pooled commands, removing
        // commands that were greedily prepared by clients that have
        // disconnected without cleaning up their mess (you naughty clients
        // you). Prune only once to prevent concurrent pruning when multiple
        // clients connect.
        //
        // Still race sensitive if another client connects while this one is not
        // done pruning. TODO I guess. :(
        $(ctrl).one("allclients", function (_, payload) {
            var clients_ar = JSON.parse(payload);
            // require set access
            var clients = {};
            clients_ar.forEach(function (nid) { clients[nid] = 58008; });
            $.each(cmds, function (nid, cmd) {
                // someone left an unused prepared command lying around
                if (cmd.userdata.creator == "prompt" &&
                    cmd.userdata.unused &&
                    !(cmd.userdata.god in clients))
                {
                    // damnit JS I had to jump through five mental hoops to find
                    // out the name of this method I know intellisense is not
                    // your responsibility but your untyped drama is not making
                    // it any easier for people to make one! TYPED JAVASCRIPT
                    // PLS
                    cmd.release();
                    // (typescript != javasript + types; typescript ==
                    // lang_with_javascript_semantics + types, i.e. diff
                    // tooling, lower adoption, docs, unfamiliar to many, etc)
                    // (wow I finally understand the semi-colon as a statement
                    // delimiter.. this... this is beautiful.)
                };
            });
        })
        // also, excuse me, but was that sexy or was that sexy? I think that was
        // sexy. maybe not ThatGirlFromRioIMetInBelem-sexy, but still quite
        // sexy.
        // ...
        // Oh man.. she was so hot..
        path($('form#path'), ctrl);
        if (window.location.hash) {
            processHash(window.location.hash.slice(1), term);
        }
        // proxy the stream event to the command object
        // comes in as: stream;1;stdout;foo bar
        // the normal event handling causes the 'stream' event to trigger
        // that's this one. this handler will proxy that event to the command
        // object's processStream method.
        $(ctrl).on('stream', function (_, rawopts) {
            var opts = rawopts.splitn(';', 3);
            var sysid = opts[0];
            var stream = opts[1];
            var data = opts[2];
            cmds[sysid].processStream(stream, data);
        });
        // click on a <a data-toggle-class="foo" href="#lala"> toggles class
        // foo on <p id=lala> 
        $('[data-toggle-class]').click(function (e) {
            e.preventDefault();
            var clsName = this.dataset.toggleClass;
            var targetSelector = this.dataset.target || $(this).attr('href');
            var $node = $(targetSelector);
            if ($node.hasClass(clsName)) {
                $node.removeClass(clsName);
            } else {
                $node.addClass(clsName);
            }
        });
        $('#sidepane').tabs();
        // I hate this class
        $('.ui-widget').removeClass('ui-widget');
        $('body').attr('data-status', 'ok');
    }

    function main() {
        // Control stream (Websocket)
        var ctrl = new Ctrl();
        ctrl.ws.onerror = function () {
            console.log('Websocket connection error');
        };
        // wait for the server
        $(ctrl).one('clientid', function (_, myid) {
            main_aux(ctrl, myid);
        });
    }

    $(document).ready(function () {
        main();
    });

});
