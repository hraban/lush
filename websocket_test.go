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
	"io"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"code.google.com/p/go.net/websocket"
)

// this function starts a server listening on localhost:15846 (good) but then
// also tests web.go a little bit. That's insane, if anything it should be part
// of web.go's unit tests, not lush.
func makeTestServer(t *testing.T) (*server, <-chan error) {
	s := newServer()
	s.web.Get("/ping", func() string {
		return "pong"
	})
	errc := make(chan error)
	go func() {
		errc <- s.Run("localhost:15846")
		close(errc)
	}()
	// wait arbitrary time for server to start
	time.Sleep(time.Second)
	rec := httptest.NewRecorder()
	req, err := http.NewRequest("GET", "/ping", nil)
	if err != nil {
		// forget about it.
		panic("failed to create ping request for testing")
	}
	// This, obviously, is not actually testing the live connection, so it's
	// kind of useless.
	s.ServeHTTP(rec, req)
	if rec.Code == 200 {
		return s, errc
	}
	// forget about testing anything
	s.Close()
	<-errc
	panic("failed to create test server")
}

// helper type to leverage ioutil.ReadAll in ioutilReadMsg. (never tested this,
// tbh, but it seems to work for small messages so I guess I'll just use it
// until it breaks.. *sigh*)
type messageReader struct {
	io.Reader
}

// non-conforming because it doesn't return 0, io.EOF on repeated use
func (mr messageReader) Read(buf []byte) (int, error) {
	n, err := mr.Reader.Read(buf)
	if err != nil {
		return n, err
	}
	if n == len(buf) {
		// there's more
		return n, nil
	}
	return n, io.EOF
}

func ioutilReadMsg(r io.Reader) ([]byte, error) {
	return ioutil.ReadAll(messageReader{r})
}

// Test websocket with an actual TCP connection
func TestWebsocketLive(t *testing.T) {
	s, weberrc := makeTestServer(t)
	done := make(chan int)
	// I wrote this stuff a while ago and it looks a bit convoluted / complex.
	// Needs trimming.
	go func() {
		select {
		case <-done:
			break
		case err := <-weberrc:
			if err != nil {
				t.Errorf("failure in webserver: %v", err)
			}
		}
	}()
	defer func() {
		done <- 80085
		s.Close()
		// drain errors, if any
		for _ = range weberrc {
		}
	}()

	// Open a websocket client to the listening socket
	origin := "http://localhost:15846/"
	url := "ws://localhost:15846/ctrl"
	ws, err := websocket.Dial(url, "", origin)
	if err != nil {
		t.Fatal("Couldn't open client websocket connection: ", err)
	}
	buf, err := ioutilReadMsg(ws)
	if err != nil {
		t.Fatal("Error reading first websocket message: ", err)
	}
	if string(buf) != "clientid;1" {
		t.Errorf("Unexpected websocket handshake: %v", buf)
	}
}
