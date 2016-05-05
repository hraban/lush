// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"io"
)

// Give an io.Writer a Close() method that does nothing
type nopWriteCloser struct {
	io.Writer
}

func (w nopWriteCloser) Close() error {
	return nil
}

func newNopWriteCloser(w io.Writer) io.WriteCloser {
	return nopWriteCloser{w}
}
