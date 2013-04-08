// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
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
	"go/build"
	"html/template"
	"log"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

const basePkg = "github.com/hraban/lush/"

var serverinitializers []func(*server)

func main() {
	p, err := build.Default.Import(basePkg, "", build.FindOnly)
	if err != nil {
		log.Fatalf("Couldn't find lush resource files")
	}
	root := p.Dir
	// TODO: not a good place for this
	tmplts := template.New("").Funcs(map[string]interface{}{
		"tocmd": func(outs liblush.OutStream) liblush.Cmd {
			to := outs.Pipe()
			if to != nil {
				if ins, ok := to.(liblush.InStream); ok {
					return ins.Cmd()
				}
			}
			return nil
		},
	})
	tmplts = template.Must(tmplts.ParseGlob(root + "/templates/*.html"))
	s := &server{
		session: liblush.NewSession(),
		root:    root,
		web:     web.NewServer(),
		tmplts:  tmplts,
	}
	s.web.Config.StaticDir = root + "/static"
	s.web.User = s
	for _, f := range serverinitializers {
		f(s)
	}
	s.web.Run("localhost:8081")
	return
}
