// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"testing"
)

// haha this is laughable. at least something is better than nothing, I guess.

func fullAddrToBare_testaux(t *testing.T, in, expected string) {
	if bare := fullAddrToBare(in); bare != expected {
		t.Errorf("%q -> %q, expected %q", in, bare, expected)
	}
}

func TestFullAddrToBare(t *testing.T) {
	fullAddrToBare_testaux(t, "1.2.3.4:1234", "1.2.3.4")
	fullAddrToBare_testaux(t, "[::1]:1234", "[::1]")
}
