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


// Control window for active commands (that box in the bottom right). Click on a
// command widget to "select" a command. In this file, selecting is called
// "associating", which can be done by calling CmdConfig.associateCmd(cmd);.
// This file is ONLY about the command window itself, and thus does not listen
// for "click" events on the widget; binding that event to this associateCmd
// method is responsibility of the caller.

define(["jquery",
        "lush/Command",
        "lush/help",
        "lush/utils"],
       function ($, Command, help, U) {

    var numInstances = 0;

    var CmdConfig = function () {
        var conf = this;
        // Identifier that allows me to ignore my own update() calls. The GUID
        // helps distinguish this CmdConfig widget from other ones if there are
        // multiple clients connected to the same lush instance.
        conf._myid = 'CmdConfig' + U.guid();
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
            selected: -1,
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
        // event unbinders
        conf._offs = [];
    };

    // Hook up to this event, and call it after association to init the view
    CmdConfig.prototype._handleAndInit = function (C, handler) {
        var conf = this;
        if (undefined === conf._initHandlers) {
            conf._initHandlers = [];
        }
        conf._offs.push(conf._cmd.on(C, handler));
        conf._initHandlers.push(handler);
    };

    CmdConfig.prototype._triggerInitHandlers = function () {
        var conf = this;
        var ev = new Command.CommandEvent();
        ev.from = 'init';
        ev.cmd = conf._cmd;
        conf._initHandlers.forEach(function (f) { f(ev); });
        delete conf._initHandlers;
    };

    // request the command to be updated. behind the scenes this happens: send
    // "updatecmd" message over ctrl stream.  server will reply with updatecmd,
    // which will invoke a handler to update the cmd object, which will trigger
    // the relevant Command.Updated****Event, which will invoke the handler that
    // updates the view. The argument is the form containing the properties as a
    // DOM node.
    CmdConfig.prototype._submitChanges = function (form) {
        var conf = this;
        var cmd = conf._cmd;
        if (cmd === undefined) {
            // no associated command
            throw new Error("Select command before saving changes");
        }
        var o = $(form).serializeObject();
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
        o.args = args;
        // delete old arg properties
        for (var k in o) {
            if (/^arg\d/.test(k)) {
                delete o[k];
            }
        }
        // set command name to argv
        o.name = o.cmd;
        for (var i = 0; i < args.length; i++) {
            o.name += ' ' + args[i];
        }
        o.userdata = $(form).data();
        cmd.update(o, conf._myid);
    }

    // Return the <input> (DOM node) for this argument, create it if it doesn't
    // exist. Expects the <input> for the arg before to already exist, if any.
    CmdConfig.prototype._ensureArgInput = function (argId) {
        if (!U.isInt(argId)) {
            throw new Error("Expected integer argument to _ensureArgInput");
        }
        var $arg = $('#cmdedit_argv input[name=arg' + argId + ']');
        if ($arg.length === 0) {
            var $arg = $('<input name=arg' + argId + '>').appendTo('#cmdedit_argv');
        }
        return $arg[0];
    };

    CmdConfig.prototype.disassociate = function () {
        var conf = this;
        var cmd = conf._cmd;
        document.getElementById('cmddetailarea').removeAttribute('data-associated');
        conf._cmd = undefined;
        conf._offs.forEach(function (f) { f(); });
        conf._offs = [];
        conf._disassocEdit();
        $('.forwarded').hide();
    };

    CmdConfig.prototype._disassocEdit = function () {
        $('fieldset#cmdedit_argv input[name=arg1] ~ input[name^=arg]').remove();
        $('#cmdedit input').val('');
    };

    CmdConfig.prototype._assocSummary = function () {
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
    };

    // initialize the edit tab for the newly associated command
    CmdConfig.prototype._assocEdit = function () {
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
    };

    CmdConfig.prototype._assocStdout = function () {
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
    };

    CmdConfig.prototype._assocStderr = function () {
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
    };

    CmdConfig.prototype._assocHelp = function () {
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
    };

    // Update all UI to this cmd (and subscribe to updates)
    CmdConfig.prototype.associateCmd = function (cmd) {
        var conf = this;
        conf.disassociate();
        conf._cmd = cmd;
        conf._assocSummary();
        conf._assocEdit();
        conf._assocStdout();
        conf._assocStderr();
        conf._assocHelp();
        document.getElementById('cmddetailarea').setAttribute('data-associated', cmd.nid);
        cmd.one(Command.WasReleasedEvent, function () {
            conf.disassociate();
        });
        // view bindings are hooked to updated event, trigger for initialization
        conf._triggerInitHandlers();
    };

    return CmdConfig;

});
