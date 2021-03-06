// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/jqueryui.d.ts" />
/// <reference path="refs/jquery.terminal.d.ts" />
/// <reference path="refs/ansi_up.d.ts" />

// TERMINAL HANDLING

import * as ansi_up from "ansi_up";
import * as $ from "jquery";
import * as jqueryui from "jquery-ui";
import * as jqueryterm from "jquery.terminal";
// prevent tsc from removing unused imports to safeguard dependency when
// bundling
var _: any = jqueryui;
_ = jqueryterm;

import Cli from "./Cli";
import * as Command from "./Command";
import * as Ctrl from "./Ctrl";
import globals from "./globals";
import Parser from "./Parser";
import Terminal from "./terminal";
import * as U from "./utils";

// prepare raw data for passing to jQuery.terminal's .echo method
function escapeTerminalOutput(text) {
    // term.echo will always append newline (which, by the way, really
    // messes up commands that write lines to stdout in multiple chunks,
    // see https://github.com/hraban/lush/issues/67) so strip one off
    // the end of the output if there already is one.
    if (U.hassuffix(text, '\r\n')) {
        text = text.slice(0, -2);
    } else if (U.hassuffix(text, '\n')) {
        text = text.slice(0, -1);
    }
    text = U.escapeHTML(text);
    text = ansi_up.ansi_to_html(text);
    // jquery.terminal interprets square brackets in a weird way
    text = text.replace(/\[/g, '&#91;');
    return text;
}

function scrollTerminalToBottom() {
    U.scrollToBottom('terminaltab');
}

// Print text to this terminal. Ensures the text always ends in newline.
// defined as a jQuery extension because the terminal object is actually a
// jquery object (you know, what with it being a jquery plugin and all).
if (!$.fn.termPrintln) {
    $.fn.termPrintln = function (text, finalize) {
        text = escapeTerminalOutput(text);
        this.echo(text, {
            finalize: finalize,
            raw: true,
        });
        scrollTerminalToBottom();
    };
}

// send what is currently on the prompt to the terminal output
function echoInput(term, finalize?: Function) {
    var txt = term.get_prompt() + term.get_command();
    return term.termPrintln(txt, finalize);
}

// Called with array of filenames to populate a partially completed command
// line word as a file. The "partial" argument is the snippet the user is
// trying to tab complete
function tabcompleteCallback(term, partial: string, files: string[]) {
    if (files.length == 0) {
        return;
    }
    if (files.length == 1) {
        term.insert(files[0].slice(partial.length) + " ");
        return;
    }
    var pref = U.lcp(files);
    if (pref.length > partial.length) {
        // all possible completions share a prefix longer than current partial
        term.insert(pref.slice(partial.length));
        return;
    }
    echoInput(term);
    $.each(files, function (_, x) { term.termPrintln(x); });
}


// set up the terminal window
export default function terminal(container: HTMLElement, processCmd: (init: any, callback?: (cmd: Command.Command) => void) => void, ctrl: Ctrl.Ctrl): Terminal {
    var cli = new Cli(processCmd);
    var latestParseError;
    var $term = $(container).terminal(function (x: string) {
        if (x.trim() === "") {
            scrollTerminalToBottom();
            return;
        }
        cli.setprompt(x).done(function () {
            cli.commit();
            scrollTerminalToBottom();
        }).fail(function (e) {
            var errmsg;
            if (typeof e === "string") {
                errmsg = e;
            } else {
                if (e.message !== undefined) {
                    errmsg = e.message;
                } else {
                    errmsg = "unknown error";
                    console.error("Unexpected parse error type: " + e);
                }
            }
            $term.error('Parse error: ' + errmsg);
            scrollTerminalToBottom();
        });
    }, {
        greetings: 'Welcome to Luyat shell',
        name: 'lush',
        prompt: '$ ',
        tabcompletion: true,
        onCommandChange: function (txt) {
            if (cli === undefined) {
                return;
            }
            // because of the way jQuery.terminal works, when a user hits
            // enter this happens:
            //
            // 1. cli.setprompt("");
            // 2. cli.commit("original commandline");
            //
            // this is a problem. the cli, upon seeing setprompt(""), thinks
            // the user removed everything he typed. it will thus remove the
            // entire prepared command tree.
            //
            // the easiest way to deal with this is to always ignore
            // onCommandChange("").  it's not that big a deal, really.
            // because of other jQuery.terminal bugs, this is actually what
            // happens anyway (it does not call setprompt() when the user
            // hits backspace).
            if (txt === "") {
                return;
            }
            cli.setprompt(txt, true);
        },
        // completion for files only
        completion: function (term) {
            cli.complete(function (partial) {
                var pattern = U.parserUnescape(partial) + "*";
                $.get('/files.json', {pattern: pattern}).done(function (options) {
                    tabcompleteCallback(term, partial, options.map(U.parserEscape));
                });
            });
        },
        exit: false,
    });
    cli.onerror = function (msg) {
        $term.error(msg);
        scrollTerminalToBottom();
    };
    cli.onUpdatedPrompt = function (txt) {
        // hack to prevent the onCommandChange handler from sending this
        // change back to the command object. justified because the real
        // solution is a better jQuery.terminal API imo.
        var tempcli = cli;
        cli = undefined;
        $term.set_command(txt);
        cli = tempcli;
    };
    globals.cli = cli;
    globals.terminal = $term;
    return $term;
}
