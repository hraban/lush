// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// Test characteristics of the system as a whole. Good place to put regression
// tests for bugs that occur by chaining many different actions.

package main

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gorilla/websocket"
)

// Changing directory in the shell causes all web requests to 404
// https://github.com/hraban/lush/issues/75
func TestIntegrationChangeDirectory(t *testing.T) {
	cwd, err := os.Getwd()
	if err == nil {
		// restore working directory to avoid side-effects on other tests
		defer os.Chdir(cwd)
	}
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()
	ws := connectWebsocketSimple(t, ts)
	defer ws.Close()
	err = ws.WriteMessage(websocket.TextMessage, []byte("chdir;/"))
	if err != nil {
		t.Fatal("Error sending chdir command:", err)
	}
	msg := getTextMessage(t, ws)
	if msg != "chdir;\"/\"" {
		t.Fatalf("Unexpected response to chdir command: %q", msg)
	}
	testGetIndexPage(t, ts.URL+"/")
}
