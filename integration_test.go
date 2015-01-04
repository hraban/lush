// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
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
