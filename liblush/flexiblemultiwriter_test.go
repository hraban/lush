// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"bytes"
	"io"
	"testing"
)

func writeAndFailOnError(t *testing.T, w io.Writer, data []byte) {
	n, err := w.Write(data)
	if err != nil {
		t.Fatalf("Unexpected error while writing to %v: %v", w, data)
	}
	if n != len(data) {
		t.Fatalf("Wrote %d bytes, expected to write %d", n, len(data))
	}
}

func TestFlexibleMultiWriter(t *testing.T) {
	var b1, b2 bytes.Buffer
	var w FlexibleMultiWriter
	w.AddWriter(&b1)
	w.AddWriter(&b2)
	const teststr = "mooom there's someone at the door!"
	writeAndFailOnError(t, &w, []byte(teststr))
	if b1.String() != teststr {
		t.Fatalf("unexpected contents of b1: %q", b1.String())
	}
	if b2.String() != teststr {
		t.Fatalf("unexpected contents of b2: %q", b2.String())
	}
}
