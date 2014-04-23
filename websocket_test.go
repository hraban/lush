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

package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func isLegalFirstMessage(msg []byte) bool {
	return strings.HasPrefix(string(msg), "clientid;")
}

// parse URL, panic on error
func urlMustParse(s string) *url.URL {
	url, err := url.Parse(s)
	if err != nil {
		panic(err)
	}
	return url
}

func connectToTestServer(t *testing.T, server *httptest.Server) net.Conn {
	addr := server.Listener.Addr()
	conn, err := net.DialTimeout(addr.Network(), addr.String(), time.Second)
	if err != nil {
		t.Fatal("Couldn't connect to test server:", err)
	}
	return conn
}

func connectWebsocket(t *testing.T, server *httptest.Server, header http.Header) (*websocket.Conn, error) {
	conn := connectToTestServer(t, server)
	url := urlMustParse(server.URL)
	url.Path = "/ctrl"
	ws, _, err := websocket.NewClient(conn, url, header, 0, 0)
	if err != nil {
		return nil, err
	}
	// All operations must complete within a second
	ws.SetReadDeadline(time.Now().Add(time.Second))
	ws.SetWriteDeadline(time.Now().Add(time.Second))
	return ws, nil
}

func connectWebsocketSimple(t *testing.T, server *httptest.Server) *websocket.Conn {
	ws, err := connectWebsocket(t, server, nil)
	if err != nil {
		ws.Close()
		t.Fatal("Couldn't open client websocket connection:", err)
	}
	return ws
}

func testWebsocketHandshake(t *testing.T, ws *websocket.Conn) {
	typ, msg, err := ws.ReadMessage()
	if err != nil {
		t.Fatal("Error reading first websocket message:", err)
	}
	if typ != websocket.TextMessage {
		t.Errorf("Unexpected websocket message type: %v", typ)
	}
	if !isLegalFirstMessage(msg) {
		t.Errorf("Unexpected websocket handshake: %s", msg)
	}
}

// Test websocket with live TCP connection
func TestWebsocket(t *testing.T) {
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	ws := connectWebsocketSimple(t, ts)
	defer ws.Close()
	testWebsocketHandshake(t, ws)
}

// Ensure access to websocket resource is denied w/o password
func TestWebsocketAuthentication(t *testing.T) {
	s := newServer()
	s.SetPassword("test")
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	ws, err := connectWebsocket(t, ts, nil)
	if err == nil {
		ws.Close()
		t.Error("Expected error when connecting without authentication")
	}
	// prehashed credentials: lush:test (net/http.Header does not support
	// SetBasicAuth)
	header := http.Header{}
	header.Set("Authorization", "Basic bHVzaDp0ZXN0")
	ws, err = connectWebsocket(t, ts, header)
	if err != nil {
		t.Fatal("Couldn't create authenticated websocket connection:", err)
	}
	defer ws.Close()
	testWebsocketHandshake(t, ws)
}
