// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// COMMAND WIDGET HELP ACTIONS

// howdy! sooo... yeaahhh... it's a bit sad that this file has been getting so
// very very little love, especially considering that this is THE solution to
// the problem that caused the frustration out of which I started this entire
// project to begin with (wtf-was-that-command-name-wtf-was-that-flag-syndrome).
// ha, ha. ahum. but you know.. omg parsers!
//
// I guess UIs are really, really not my thing.
//
// anyway some mc'lovin would be much much appreciated here.

/// <reference path="refs/jquery.d.ts" />

import * as $ from "jquery";
import * as Command from "./Command";

interface HelpHandler {
    (cmd: Command.Command, $help: JQuery): void;
}

var actions: { [name: string]: HelpHandler } = {
    tar: function (cmd, $help) {
        $help.append($('<a href="http://unixhelp.ed.ac.uk/CGI/man-cgi?tar" target=_blank>online man page</a>'));
        $help.append($('<br>'));
        var $changeflag = $('<input type=checkbox>').change(function () {
            // copy array to leave cmd object intact
            var args = cmd.args.slice(0);
            if (this.checked) {
                if (args.length == 0) {
                    args = ['x'];
                } else if (args[0].indexOf('x') == -1) {
                    // order is important
                    args[0] = 'x' + args[0];
                }
            } else {
                // should always have an arg
                if (args.length == 0) {
                    console.log('weird: unchecked extract, but no 1st arg');
                    console.log(cmd);
                } else {
                    args[0] = args[0].replace(/x/g, '')
                }
            }
            cmd.update({
                args: args,
            });
        });
        (<any>$changeflag.get(0)).checked = (cmd.args.length > 0 && cmd.args[0].indexOf('x') != -1);
        $help.append($('<label>extract: </label>').append($changeflag));
    },

    git: function (cmd, $help) {
        // hahahahaha what is this my dog's funeral? because that's how much
        // I'm crying right now.
        $help.append($('<a href="https://www.kernel.org/pub/software/scm/git/docs/" target=_blank>online man page</a>'));
        $help.append($('<br>'))
        $help.append($('<a href="">back</a>').click(function (e) {
            e.preventDefault();
        }));
    },
};

function defaultHelp(cmd: Command.Command, $help: JQuery) {
    $help.html('This tab is intended for interactive management of command line flags. Currently only a proof of concept, if you happen to be a programmer willing to help me out here that would be great. Shoot me an e-mail at hraban@0brg.net or go to <a target=_blank href=http://github.com/hraban/lush>github.com/hraban/lush</a> and have a look around! Especially in the <a target=_blank href=http://github.com/hraban/lush/blob/master/static/js/lush/help.js>/static/js/lush/help.js</a> file.');
}

export default function getHelp(cmd: Command.Command): HelpHandler {
    return actions[cmd.cmd] || defaultHelp;
}