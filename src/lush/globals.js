// Project-wide globals in one object. Always refer to this object and the
// elements within it by full name for easy greping. Initialization of this
// object should be done only by main functions of modules, and only once. No
// reinitializing later.
// TODO: (Assert)Exception if get before set
// TODO: (Assert)Exception if set unknown key
window.globals = {
    // websocket connection for control events
    ctrl: undefined,
    // (shell-sessionlocal) ID of this client
    moi: undefined,
    // Cli instance. Useful for debugging.
    cli: undefined,
    // jQuery.terminal instance. also for debugging.
    terminal: undefined,
};

// object containing running command metadata: key is system id, value is cmd
// object
// TODO: Should be in globals
window.cmds = {};
