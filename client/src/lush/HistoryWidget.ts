// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// The logic behind the control window for active commands.

/// <reference path="refs/jquery.d.ts" />
/// <reference path="refs/react-0.13.0.d.ts" />
/// <reference path="Command.ts"/>
/// <reference path="utils.ts" />

import * as React from "react/addons";
import * as $ from "jquery";
import * as Command from "./Command";
import globals from "./globals";
import * as U from "./utils";

// Getting a TS warning on the handleClick mixin---there's probably a better
// way but I need to read up on the advancements in both TS and React since
// I've last been here to find out what that is. For now just <any> all the
// things.
// TODO
var HistoryEntry = React.createClass(<any>{
    handleClick: function (e) {
        e.preventDefault();
        this.props.cmd.setArchivalState(!this.props.cmd.userdata.archived);
    },

    render: function () {
        var cmd = this.props.cmd;
        if (!cmd.isRoot()) {
            return null;
        }
        var classNames = React.addons.classSet({
            "history-entry": true,
            archived: cmd.userdata.archived
        });
        var myprops = {
            href: "",
            "data-gid": cmd.nid,
            key: "history-entry-" + cmd.nid,
            className: classNames,
            onClick: this.handleClick
        };
        var txt = cmd.nid + ": " + cmd.cmdChainToPrompt();
        return React.DOM.a(myprops, txt);
    }
});

// Scope jquery eventnames to local namespace
function scopeEvents(...evName: string[]): string {
    return evName.map(x => x + ".HistoryWidget").join(" ");
}

class ChangedHierarchyEvent extends Command.CommandEvent {
    static eventName = "ChangedHierarchyEvent";
}

// Build a history list entry for this command. Does not modify DOM, does not
// register cleanup handlers for DOM. Does register cleanup handlers for
// internal events, but that should be transparent.
function createHistoryEntry(cmd): HTMLElement {

    var wrapper = document.createElement("div");
    // TODO: React mixins (or something)
    var reactel = React.createElement(HistoryEntry, <any>{ cmd: cmd });
    var component = React.render(reactel, wrapper);

    var evs = [
        Command.UpdatedArgsEvent,
        Command.UpdatedCmdEvent,
        Command.UpdatedNameEvent,
        Command.ArchivalEvent,
        ChangedHierarchyEvent
    ];
    var offs = [cmd.onany(evs, function (e) {
        var cmd = e.cmd;
        component.setProps({cmd: cmd});
    })];
    var evNames = scopeEvents("parentAdded", "parentRemoved");
    function handleParentChanged(cmd: Command.Command, dad: Command.Command) {
        dad.trigger(new ChangedHierarchyEvent());
        component.setProps({cmd: cmd});
    }
    offs.push(cmd.on(Command.ParentAddedEvent, function (e) {
        handleParentChanged(e.cmd, e.newparent);
    }));
    offs.push(cmd.on(Command.ParentRemovedEvent, function (e) {
        handleParentChanged(e.cmd, e.oldparent);
    }));
    cmd.one(Command.WasReleasedEvent, function () {
        offs.forEach(f => f());
        offs = undefined;
    });

    return wrapper;
};

var numInstances = 0;

export default class HistoryWidget {

    constructor() {
        // history widget operates on the DOM directly (hard-coded IDs, certain
        // nodes are expected, ...)
        if (numInstances++ > 0) {
            throw new Error("HistoryWidget is a singleton");
        }
        $('#delete_archived_and_completed').click(function (e) {
            e.preventDefault();
            $('#history .archived').each(function () {
                // compiler is getting confused about the type. I think I
                // should upgrade compilers, but I want to get it to work
                // again with this one, first. <any> all the things.
                // TODO
                var gid: any = $(this).data('gid');
                var cmd = globals.cmds[gid];
                if (cmd.status.code > 1) {
                    cmd.releaseGroup();
                }
            });
        });
    }

    addCommand(cmd) {
        var entry = createHistoryEntry(cmd);
        $('#history').append(entry);
        cmd.one(Command.WasReleasedEvent, function () {
            React.unmountComponentAtNode(entry);
            $(entry).remove();
        });
    }

}
