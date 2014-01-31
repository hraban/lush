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


// The logic behind the control window for active commands.

define(["jquery",
        'lush/help',
        "lush/utils"],
       function ($, help) {

    var numInstances = 0;

    var CmdConfig = function () {
        var conf = this;
        if (numInstances++ > 0) {
            throw "CmdConfig must not be instanciated more than once";
            // yeah yeah yeah that means it's not supposed to be a class. it's
            // just more uniform icw modules &c: modules provide classes, they
            // can be instantiated, they have methods to control whatever it is
            // they represent, yada yada yada. don't instantiate it twice, shut
            // up, and eat your cereal.
        }
        $('#cmdedit input[name=cmd]').autocomplete({source: "/new/names.json"});
        $('#cmddetailarea').tabs();
        $('#cmdedit form').on('keydown', 'input[name^=arg]', function (e) {
            // if typing in the last argument field
            if ($(this).nextAll('input[name^=arg]').length == 0) {
                var newname = +(this.name.slice(3)) + 1; // hahaha
                newname = 'arg' + newname;
                // the user needs a new empty argument field
                $(this).clone()
                    .attr('name', newname)
                    .val('')
                    .insertAfter(this);
            }
        }).submit({conf: conf}, function (e) {
            // request the command to be updated. behind the scenes this
            // happens: send "updatecmd" message over ctrl stream.  server will
            // reply with updatecmd, which will invoke a handler to update the
            // cmd object, which will invoke $(cmd).trigger('updated') (in the
            // relevant namespace), which will invoke the handler that updates
            // the view
            e.preventDefault();
            var conf = e.data.conf;
            var cmd = conf._cmd;
            if (cmd === undefined) {
                // no associated command
                throw "Select command before saving changes";
            }
            var o = $(this).serializeObject();
            // cast numeric inputs to JS ints
            $.each(o, function (key, val) {
                if (/^\d+$/.test(val)) {
                    o[key] = parseInt(val);
                }
            });
            // arg1="foo", arg2="bar", ... => ["foo", "bar", ...]
            var $args = $(this).find('input[name^=arg]');
            var args = $.map($args, attrgetter('value'));
            args = removeFalse(args);
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
            o.userdata = $(this).data();
            cmd.update(o);
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
    };

    CmdConfig.prototype.disassociate = function () {
        var conf = this;
        var cmd = conf._cmd;
        if (cmd === undefined) {
            return;
        }
        $(cmd).off('.cmdconfig');
        conf._cmd = undefined;
        conf._disassocEdit();
        $('.forwarded').hide();
    };

    CmdConfig.prototype._disassocEdit = function () {
        $('#cmdedit input[name=arg1] ~ input[name^=arg]').remove();
        $('#cmdedit input').val('');
    };

    // initialize the edit tab for the newly associated command
    CmdConfig.prototype._assocEdit = function () {
        var conf = this;
        var $editm = $('#cmdedit');
        var cmd = conf._cmd;
        $(cmd).on('updated.cmd.cmdconfig', function () {
            var cmd = this;
            $editm.find('[name=cmd]').val(cmd.cmd);
        });
        $(cmd).on('updated.args.cmdconfig', function () {
            var cmd = this;
            // remove all arg fields (in case num args decreased)
            $editm.find('input[name=arg1] ~ input[name^=arg]').remove();
            cmd.args.forEach(function (arg, idx) {
                // keydown triggers the "create new arg input" handler
                $editm.find('[name=arg' + (idx + 1) + ']').val(arg).keydown();
            });
        });
        $(cmd).on('updated.stdoutScrollback.cmdconfig', function () {
            var cmd = this;
            $editm.find('[name=stdoutScrollback]').val(cmd.stdoutScrollback)
        });
        $(cmd).on('updated.stderrScrollback.cmdconfig', function () {
            var cmd = this;
            $editm.find('[name=stderrScrollback]').val(cmd.stderrScrollback)
        });
        $(cmd).on('done.cmdconfig', function () {
            // no need for editing anymore, release all closures
            var cmd = this;
            $(cmd).off('.cmdconfig');
        });
        $editm.find('.cancelbtn').click({cmd: cmd}, function (e) {
            var cmd = e.data.cmd;
            $(cmd).trigger('updated.cmdconfig');
        });
    };

    CmdConfig.prototype._assocStdout = function () {
        var conf = this;
        var cmd = conf._cmd;
        $(cmd).on('updated.stdout.cmdconfig', function () {
            var cmd = this;
            $('#cmdstdout .streamdata').text(cmd.stdout);
        });
        $(cmd).on('updated.stdoutto.cmdconfig', function () {
            var cmd = this;
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
        $(cmd).on('updated.stderr.cmdconfig', function () {
            var cmd = this;
            $('#cmdstderr .streamdata').text(cmd.stderr);
        });
        $(cmd).on('updated.stderrto.cmdconfig', function () {
            var cmd = this;
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
        $(cmd).on('updated.cmd.args.cmdconfig', function () {
            var cmd = this;
            var $help = $('#cmdhelp');
            // clean out help div
            $help.empty();
            var action = help(cmd);
            if (action) {
                action(cmd, $help);
            } else {
                // todo: hide help tab?
            }
        });
    };

    // Update all UI to this cmd (and subscribe to updates)
    CmdConfig.prototype.associateCmd = function (cmd) {
        var conf = this;
        conf.disassociate();
        conf._cmd = cmd;
        conf._assocEdit();
        conf._assocStdout();
        conf._assocStderr();
        conf._assocHelp();
        // view bindings are hooked to updated event, trigger for initialization
        $(cmd).trigger('updated.cmdconfig');
    };

    return CmdConfig;

});
