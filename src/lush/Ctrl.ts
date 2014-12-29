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

// control stream related scripting

/// <reference path="refs/jquery.d.ts" />
/// <reference path="utils.ts" />

import $ = require("jquery");
import U = require("./utils");

class Ctrl {
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
                Ctrl.prototype.send.apply(ctrl, args)
            });
            return;
        default:
            // closing / closed? send is error
            throw "sending over closed control channel";
        }
        // normal send
        if (args.length == 1) {
            // needs at least 1 argument
            args.push("");
        }
        ctrl.ws.send(args.join(';'));
    }
}

export = Ctrl;
