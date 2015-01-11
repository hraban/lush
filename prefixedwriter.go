// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"errors"
	"io"
)

// prefix all calls to underlying Write() with a fixed message
type prefixedWriter struct {
	io.Writer
	Prefix []byte
}

// copy data to a new buffer to accomodate prefix and call underlying Write
// only once
func (pw *prefixedWriter) Write(p []byte) (int, error) {
	newbuf := make([]byte, len(p)+len(pw.Prefix))
	n := copy(newbuf, pw.Prefix)
	copy(newbuf[n:], p)
	return pw.Writer.Write(newbuf)
}

// close underlying writer if supported, error if not io.Closer
func (pw *prefixedWriter) Close() error {
	if c, ok := pw.Writer.(io.Closer); ok {
		return c.Close()
	}
	return errors.New("underlying writer does not have Close() method")
}

func newPrefixedWriter(w io.Writer, prefix []byte) *prefixedWriter {
	return &prefixedWriter{
		Writer: w,
		Prefix: prefix,
	}
}
