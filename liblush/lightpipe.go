// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package liblush

import (
	"io"
)

// io.Pipe clone with reference to Cmd
type lightpipe struct {
	w   io.WriteCloser
	cmd Cmd
}

func (p *lightpipe) Write(data []byte) (int, error) {
	return p.w.Write(data)
}

func (p *lightpipe) Close() error {
	return p.w.Close()
}

func (p *lightpipe) Cmd() Cmd {
	return p.cmd
}

func newLightPipe(c Cmd, w io.WriteCloser) *lightpipe {
	return &lightpipe{
		cmd: c,
		w:   w,
	}
}
