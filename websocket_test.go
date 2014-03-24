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
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "code.google.com/p/go.net/websocket"
)

func makeTestServer(t *testing.T) (*server, <-chan error) {
	s := newServer()
	s.web.Get("/ping", func() string {
		return "pong"
	})
	errc := make(chan error)
	go func() {
		errc <- s.Run("localhost:15846")
	}()
	// wait arbitrary time for server to start
	time.Sleep(time.Second)
	rec := httptest.NewRecorder()
	req, err := http.NewRequest("GET", "/ping", nil)
	if err != nil {
		// forget about it.
		panic("failed to create ping request for testing")
	}
	s.ServeHTTP(rec, req)
	if rec.Code == 200 {
		return s, errc
	}
	// forget about testing anything
	s.Close()
	<-errc
	panic("failed to create test server")
}

func TestStub(t *testing.T) {
	s, weberrc := makeTestServer(t)
	done := make(chan int)
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

	// test server here...

	done <- 80085
	s.Close()
	<-weberrc
}
