// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// Control window for active commands (that box in the bottom right). Click on a
// command widget to "select" a command. In this file, selecting is called
// "associating", which can be done by calling CmdConfig.associateCmd(cmd);.
// This file is ONLY about the command window itself, and thus does not listen
// for "click" events on the widget; binding that event to this associateCmd
// method is responsibility of the caller.

/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/jqueryui.d.ts" />
/// <reference path="refs/jquery-lush.d.ts"/>
/// <reference path="utils.ts" />

import $ = require("jquery");
import Command = require("./Command");
import help = require("./help");
import U = require("./utils");

// declare main.js
declare var cmds: { [nid: number]: Command.Command };

var numInstances = 0;

class CmdConfig {
    private _cmd: Command.Command;
    private _initHandlers: { (ev: Command.CommandEvent): void }[];
    private _myid = 'CmdConfig' + U.guid();
    // event unbinders
    private _offs: Function[] = [];

    constructor() {
        var conf = this;
        // Identifier that allows me to ignore my own update() calls. The GUID
        // helps distinguish this CmdConfig widget from other ones if there are
        // multiple clients connected to the same lush instance.
        if (numInstances++ > 0) {
            throw new Error("CmdConfig must not be instanciated more than once");
            // yeah yeah yeah that means it's not supposed to be a class. it's
            // just more uniform icw modules &c: modules provide classes, they
            // can be instantiated, they have methods to control whatever it is
            // they represent, yada yada yada. don't instantiate it twice, shut
            // up, and eat your cereal.
        }
        $('#cmdedit input[name=cmd]').autocomplete({source: "/new/names.json"});
        $('#cmddetailarea').tabsBottom({
            collapsible: true,
            active: -1,
        });
        $('#cmdedit form').on('keydown', 'input[name^=arg]', function (e) {
            var argId = +(this.name.slice(3));
            // if there is no next argument, make an empty one
            conf._ensureArgInput(argId + 1);
        }).on('input', 'input', {conf: conf}, function (e) {
            // that binding looks weird: it's the "input" event on all "<input>"
            // tags that are a child of "#cmdedit form"
            var form = $(this).closest('form')[0];
            var conf = e.data.conf;
            conf._submitChanges(form);
        }).submit({conf: conf}, function (e) {
            var form = this;
            e.preventDefault();
            var conf = e.data.conf;
            conf._submitChanges(form);
        });
        $('#cmdstdout .forwarded a').click(function (e) {
            e.preventDefault();
            var cmd = conf._cmd;
            if (cmd !== undefined) {
                cmd.update({stdoutto: 0});
            }
        });
        $('#cmdstderr .forwarded a').click(function (e) {
            e.preventDefault();
            var cmd = conf._cmd;
            if (cmd !== undefined) {
                cmd.update({stderrto: 0});
            }
        });
    }

    // Hook up to this event, and call it after association to init the view
    private _handleAndInit(C, handler) {
        var conf = this;
        if (undefined === conf._initHandlers) {
            conf._initHandlers = [];
        }
        conf._offs.push(conf._cmd.on(C, handler));
        conf._initHandlers.push(handler);
    }

    private _triggerInitHandlers() {
        var conf = this;
        var ev = new Command.CommandEvent();
        ev.from = 'init';
        ev.cmd = conf._cmd;
        conf._initHandlers.forEach(function (f) { f(ev); });
        delete conf._initHandlers;
    }

    // request the command to be updated. behind the scenes this happens: send
    // "updatecmd" message over ctrl stream.  server will reply with updatecmd,
    // which will invoke a handler to update the cmd object, which will trigger
    // the relevant Command.Updated****Event, which will invoke the handler that
    // updates the view. The argument is the form containing the properties as a
    // DOM node.
    private _submitChanges(form) {
        var conf = this;
        var cmd = conf._cmd;
        if (cmd === undefined) {
            // no associated command
            throw new Error("Select command before saving changes");
        }
        var o = <{[key: string]: any}>$(form).serializeObject();
        // cast numeric inputs to JS ints
        $.each(o, function (key, val) {
            if (/^\d+$/.test(val)) {
                o[key] = parseInt(val);
            }
        });
        // arg1="foo", arg2="bar", ... => ["foo", "bar", ...]
        var $args = $(form).find('input[name^=arg]');
        var args = $.map($args, U.attrgetter('value'));
        // TODO: deletes all empty args, but should only strip trailing empty
        // args. Even better: there should be a button on every arg input to
        // actually delete it, maybe special case strip the last arg if it's
        // empty because that one is create automatically.
        args = U.removeFalse(args);
        o['args'] = args;
        // delete old arg properties
        for (var k in o) {
            if (/^arg\d/.test(k)) {
                delete o[k];
            }
        }
        // set command name to argv
        o['name'] = o['cmd'];
        for (var i = 0; i < args.length; i++) {
            o['name'] += ' ' + args[i];
        }
        o['userdata'] = $(form).data();
        cmd.update(o, conf._myid);
    }

    // Return the <input> (DOM node) for this argument, create it if it doesn't
    // exist. Expects the <input> for the arg before to already exist, if any.
    private _ensureArgInput(argId: number): HTMLInputElement {
        if (!U.isInt(argId)) {
            throw new Error("Expected integer argument to _ensureArgInput");
        }
        var $arg = $('#cmdedit_argv input[name=arg' + argId + ']');
        if ($arg.length === 0) {
            var $arg = $('<input name=arg' + argId + '>').appendTo('#cmdedit_argv');
        }
        return <HTMLInputElement>$arg.get(0);
    }

    disassociate() {
        var conf = this;
        var cmd = conf._cmd;
        document.getElementById('cmddetailarea').removeAttribute('data-associated');
        conf._cmd = undefined;
        conf._offs.forEach(function (f) { f(); });
        conf._offs = [];
        conf._disassocEdit();
        $('.forwarded').hide();
    }

    private _disassocEdit() {
        $('fieldset#cmdedit_argv input[name=arg1] ~ input[name^=arg]').remove();
        $('#cmdedit input').val('');
    }

    private _assocSummary() {
        var conf = this;
        var cmd = conf._cmd;
        function handleArgvChange(e) {
            var cmd = e.cmd;
            $('#cmdsummary_argv').text(cmd.getArgv().join(" "));
        }
        conf._handleAndInit(Command.UpdatedArgsEvent, handleArgvChange);
        conf._handleAndInit(Command.UpdatedCmdEvent, handleArgvChange);
        conf._handleAndInit(Command.UpdatedCwdEvent, function (e) {
            var cmd = e.cmd;
            $('#cmdsummary_cwd').text(cmd.cwd);
        });
        conf._handleAndInit(Command.UpdatedStartwdEvent, function (e) {
            var cmd = e.cmd;
            $('#cmdsummary_startwd').text(cmd.startwd);
        });
    }

    // initialize the edit tab for the newly associated command
    private _assocEdit() {
        var conf = this;
        var $editm = $('#cmdedit');
        var cmd = conf._cmd;
        conf._handleAndInit(Command.UpdatedCmdEvent, function (e) {
            var cmd = e.cmd;
            if (e.from === conf._myid) {
                return;
            }
            $editm.find('[name=cmd]').val(cmd.cmd);
        });
        conf._handleAndInit(Command.UpdatedArgsEvent, function (e) {
            var cmd = e.cmd;
            if (e.from === conf._myid) {
                return;
            }
            var args = cmd.args.slice(0); // copy to modify
            // append one empty arg to always have an empty input field
            args.push('');
            args.forEach(function (arg, idx) {
                var node = conf._ensureArgInput(idx + 1);
                node.value = arg;
            });
            // if any of these exist, the number of args decreased so these
            // inputs must be removed
            var lastArgId = args.length;
            $editm.find('input[name=arg' + lastArgId + ']').nextAll().remove();
        });
        conf._handleAndInit(Command.UpdatedStdoutScrollbackEvent, function (e) {
            var cmd = e.cmd;
            if (e.from === conf._myid) {
                return;
            }
            $editm.find('[name=stdoutScrollback]').val(cmd.stdoutScrollback);
        });
        conf._handleAndInit(Command.UpdatedStderrScrollbackEvent, function (e) {
            var cmd = e.cmd;
            if (e.from === conf._myid) {
                return;
            }
            $editm.find('[name=stderrScrollback]').val(cmd.stderrScrollback);
        });
        cmd.one(Command.DoneEvent, function (e) {
            // TODO: Disable inputs somehow (remember to reenable on
            // disassociate)
        });
    }

    private _assocStdout() {
        var conf = this;
        var cmd = conf._cmd;
        conf._handleAndInit(Command.UpdatedStdoutEvent, function (e) {
            var cmd = e.cmd;
            $('#cmdstdout .streamdata').text(cmd.stdout);
        });
        conf._handleAndInit(Command.UpdatedStdouttoEvent, function (e) {
            var cmd = e.cmd;
            if (cmd.stdoutto) {
                $('#stdouttoid').text(cmd.stdoutto);
                $('#cmdstdout .forwarded').show();
            } else {
                $('#cmdstdout .forwarded').hide();
            }
        });
    }

    private _assocStderr() {
        var conf = this;
        var cmd = conf._cmd;
        conf._handleAndInit(Command.UpdatedStderrEvent, function (e) {
            var cmd = e.cmd;
            $('#cmdstderr .streamdata').text(cmd.stderr);
        });
        conf._handleAndInit(Command.UpdatedStderrtoEvent, function (e) {
            var cmd = e.cmd;
            if (cmd.stderrto) {
                $('#stderrtoid').text(cmd.stderrto);
                $('#cmdstderr .forwarded').show();
            } else {
                $('#cmdstderr .forwarded').hide();
            }
        });
    }

    private _assocHelp() {
        var conf = this;
        var cmd = conf._cmd;
        function handleArgvChange(e) {
            var cmd = e.cmd;
            var $help = $('#cmdhelp');
            // clean out help div
            $help.empty();
            var action = help(cmd);
            if (action) {
                action(cmd, $help);
            } else {
                // todo: hide help tab?
            }
        }
        conf._handleAndInit(Command.UpdatedArgsEvent, handleArgvChange);
        conf._handleAndInit(Command.UpdatedCmdEvent, handleArgvChange);
    }

    // Update all UI to this cmd (and subscribe to updates)
    associateCmd(cmd: Command.Command) {
        var conf = this;
        conf.disassociate();
        conf._cmd = cmd;
        conf._assocSummary();
        conf._assocEdit();
        conf._assocStdout();
        conf._assocStderr();
        conf._assocHelp();
        document.getElementById('cmddetailarea').setAttribute('data-associated', ''+cmd.nid);
        cmd.one(Command.WasReleasedEvent, function () {
            conf.disassociate();
        });
        // view bindings are hooked to updated event, trigger for initialization
        conf._triggerInitHandlers();
    }
}

export = CmdConfig;
