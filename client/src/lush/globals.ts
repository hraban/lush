// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// Project-wide globals in one object. Always refer to this object and the
// elements within it by full name for easy greping. Initialization of this
// object should be done only by main functions of modules, and only once. No
// reinitializing later.

// TODO: (Assert)Exception if get before set

/// <reference path="./Cli.ts"/>
/// <reference path="./Command.ts"/>
/// <reference path="./Ctrl.ts"/>

import Cli from "./Cli";
import * as Ctrl from "./Ctrl";
import * as Command from "./Command";
import Terminal from "./terminal";

var globals = {
    // websocket connection for control events
    ctrl: <Ctrl.Ctrl> undefined,
    // (shell-sessionlocal) ID of this client
    moi: <string> undefined,
    // Cli instance. Useful for debugging.
    cli: <Cli> undefined,
    // jQuery.terminal instance. also for debugging.
    terminal: <Terminal> undefined,
    // object containing running command metadata: key is system id, value is
    // cmd object
    cmds: <{ [key: number]: Command.Command }> {},
};

export default globals;

// nice for debugging, but defeats type safety so don't use internally
window['lushglobals'] = globals;

