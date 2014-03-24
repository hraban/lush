package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// panic if err is not nil, return first arg if it is
func mustRequest(req *http.Request, err error) *http.Request {
	if err != nil {
		panic(err)
	}
	return req
}

func TestAuthentication(t *testing.T) {
	s := newServer()
	s.SetPassword("test")
	rec := httptest.NewRecorder()
	req := mustRequest(http.NewRequest("GET", "/", nil))
	s.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatal("Expected 401 Unauthorized status, got", rec.Code)
	}
}
