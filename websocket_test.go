// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"fmt"
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
	url.Scheme = "ws"
	ws, _, err := websocket.NewClient(conn, url, header, 1024, 1024)
	if err != nil {
		return nil, fmt.Errorf("raw websocket client: %v", err)
	}
	return ws, nil
}

func connectWebsocket(t *testing.T, server *httptest.Server, header http.Header) (*websocket.Conn, error) {
	ws, err := connectWebsocketNoHandshake(t, server, header)
	if err != nil {
		return nil, fmt.Errorf("raw websocket connection: %v", err)
	}
	performWebsocketHandshake(t, ws)
	return ws, nil
}

// no auth, all errors are fatal
func connectWebsocketSimple(t *testing.T, server *httptest.Server) *websocket.Conn {
	ws, err := connectWebsocket(t, server, nil)
	if err != nil {
		t.Fatal("lush websocket connection:", err)
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
