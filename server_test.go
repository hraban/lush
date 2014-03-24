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
