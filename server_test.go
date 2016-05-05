// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
)

// panic if err is not nil, return first arg if it is
func mustRequest(req *http.Request, err error) *http.Request {
	if err != nil {
		panic(err)
	}
	return req
}

func TestServerAuthentication(t *testing.T) {
	s := newServer()
	s.SetPassword("test")
	rec := httptest.NewRecorder()
	req := mustRequest(http.NewRequest("GET", "/", nil))
	s.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Error("Expected 401 Unauthorized status, got", rec.Code)
	}
	req.SetBasicAuth("lush", "test")
	rec = httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Error("Expected 200 status with password 'test', got", rec.Code)
	}
	req.SetBasicAuth("lush", "wrongpass")
	rec = httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Error("Expected 401 status with password 'wrongpass', got", rec.Code)
	}
}

func testGetIndexPage(t *testing.T, url string) {
	res, err := http.Get(url)
	if err != nil {
		t.Fatal("Connecting to test server failed:", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("Non-200 status when getting index page at %q: %d", url,
			res.StatusCode)
	}
	page, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatal("Couldn't read response:", err)
	}
	if !regexp.MustCompile(`<title>lush - Luyat shell</title>`).Match(page) {
		t.Error("Didn't find expected <title> tag in root page")
	}
}

func TestServerLive(t *testing.T) {
	s := newServer()
	ts := httptest.NewServer(s.httpHandler)
	defer ts.Close()

	testGetIndexPage(t, ts.URL+"/")
}
