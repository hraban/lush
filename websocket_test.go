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
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

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

func getTextMessage(t *testing.T, ws *websocket.Conn) string {
	typ, msg, err := ws.ReadMessage()
	if err != nil {
		t.Fatal("Error reading websocket message:", err)
	}
	if typ != websocket.TextMessage {
		t.Errorf("Unexpected websocket message type: %v", typ)
	}
	return string(msg)
}

// timeout error on all network activity
func setDeadline(ws *websocket.Conn, d time.Duration) {
	ws.SetReadDeadline(time.Now().Add(d))
	ws.SetWriteDeadline(time.Now().Add(d))
}

func performWebsocketHandshake(t *testing.T, ws *websocket.Conn) {
	setDeadline(ws, 4*time.Second)
	// Must be consumed if you want to use this connection
	err := ws.WriteMessage(websocket.TextMessage, []byte(getWebsocketKey()))
	if err != nil {
		t.Fatalf("Error writing websocket key: %v", err)
	}
	msg := getTextMessage(t, ws)
	if !regexp.MustCompile(`^clientid;[0-9]+$`).MatchString(msg) {
		t.Errorf("Unexpected websocket handshake (clientid): %q", msg)
	}
	msg = getTextMessage(t, ws)
	if !regexp.MustCompile(`^allclients;\[[0-9, ]*\]$`).MatchString(msg) {
		t.Errorf("Unexpected websocket handshake (allclients): %q", msg)
	}
}

func connectWebsocketNoHandshake(t *testing.T, server *httptest.Server, header http.Header) (*websocket.Conn, error) {
	conn := connectToTestServer(t, server)
	url := urlMustParse(server.URL)
	url.Path = "/ctrl"
	ws, _, err := websocket.NewClient(conn, url, header, 1024, 1024)
	if err != nil {
		return nil, err
	}
	return ws, nil
}

func connectWebsocket(t *testing.T, server *httptest.Server, header http.Header) (*websocket.Conn, error) {
	ws, err := connectWebsocketNoHandshake(t, server, header)
	if err != nil {
		return nil, err
	}
	performWebsocketHandshake(t, ws)
	return ws, nil
}

// no auth, all errors are fatal
func connectWebsocketSimple(t *testing.T, server *httptest.Server) *websocket.Conn {
	ws, err := connectWebsocket(t, server, nil)
	if err != nil {
		ws.Close()
		t.Fatal("Couldn't open client websocket connection:", err)
	}
	return ws
}

// Test websocket with live TCP connection
func TestWebsocket(t *testing.T) {
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	ws := connectWebsocketSimple(t, ts)
	defer ws.Close()
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
}

func TestWebsocketNoKey(t *testing.T) {
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	defer ts.CloseClientConnections()
	ws, err := connectWebsocketNoHandshake(t, ts, nil)
	if err != nil {
		t.Fatal(err)
	}
	setDeadline(ws, 1*time.Second)
	_, _, err = ws.ReadMessage()
	if nerr, ok := err.(net.Error); !ok || !nerr.Timeout() {
		t.Errorf("Expected timeout error on read, got: %#v", err)
	}
}

func TestWebsocketWrongKey(t *testing.T) {
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	defer ts.CloseClientConnections()
	ws, err := connectWebsocketNoHandshake(t, ts, nil)
	if err != nil {
		t.Fatal(err)
	}
	setDeadline(ws, 1*time.Second)
	err = ws.WriteMessage(websocket.TextMessage, []byte("tralalala"))
	if err != nil {
		t.Fatalf("Error writing websocket key: %v", err)
	}
	msg := getTextMessage(t, ws)
	if strings.ContainsRune(msg, ';') {
		t.Errorf("Sent illegal key but reply looks like a command: %q", msg)
	}
}
