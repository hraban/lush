// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// control stream related scripting

/// <reference path="refs/jquery.d.ts" />
/// <reference path="utils.ts" />

import * as $ from "jquery";
import * as U from "./utils";

export interface Ctrl {
    send(...args: string[]);
}

export class WebsocketCtrl implements Ctrl {
    private ws: WebSocket;

    constructor(url: string, key: string) {
        var ctrl = this;
        ctrl.ws = new WebSocket(U.wsURI(url));
        var handleWebsocketMessage = function (e) {
            // First message MUST be a clientid event
            if (!/^clientid;\d+/.test(e.data)) {
                console.log("Got illegal first message: " + e.data);
                handleWebsocketMessage = function () { }
                ctrl.ws.close(1002, "First websocket event must be clientid");
                // TODO: Chrome complains about this 1002 code, but look:
                //
                // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
                //
                // and
                //
                // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
                //
                // clearly lists 1002 as CLOSE_PROTOCOL_ERROR
                //
                // so what the dilly? is MDN wrong or Chrome? Either way, I'm
                // not. And that's what counts.
                return;
            }
            handleWebsocketMessage = e => ctrl._handleWsOnMessage(e);
            handleWebsocketMessage(e);
        };
        // Proxy function. Overwriting this one directly, instead of going
        // through handleWebsocketMessage, causes some weird behavior on
        // Firefox 29. Didn't want to investigate further; set .onmessage once
        // and handle changing handlers internally fixes the problem.
        ctrl.ws.onmessage = function (e) {
            handleWebsocketMessage(e);
        };
        ctrl.ws.onopen = function () {
            ctrl.ws.send(key);
        };
        ctrl.ws.onclose = function () {
            // NOOOO NOOO ONOO NO NONO NOOOOO!
            $('body').attr('data-status', 'connection_error');
            // this is RAUNG! what about clean exits, kyle? what about them?!
        };
        ctrl.ws.onerror = function () {
            console.error('Websocket connection error');
        };
        $(ctrl).on('exiting', function () {
            var ctrl = this;
            ctrl.ws.close(1000, "Server shut itself down");
        });
    }

    private _handleWsOnMessage(e) {
        var ctrl = this;
        var x = U.splitn(e.data, ';', 2);
        var cmd = x[0];
        var rest = x[1];
        // transform to jquery event on control stream object
        $(ctrl).trigger(cmd, rest);
    }

    send(...args: string[]) {
        var ctrl = this;
        switch (this.ws.readyState) {
        case WebSocket.OPEN:
            // send normally
            break;
        case WebSocket.CONNECTING:
            // wait for open.
            // no race bc js is single threaded
            $(ctrl).one('open', function () {
                // try again (and detach after handling)
                ctrl.send.apply(ctrl, args)
            });
            return;
        default:
            // closing / closed? send is error
            throw new Error("sending over closed control channel");
        }
        // normal send
        if (args.length == 1) {
            // needs at least 1 argument
            args.push("");
        }
        ctrl.ws.send(args.join(';'));
    }
}

