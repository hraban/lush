// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
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
	"flag"
	"log"
)

func main() {
	s := newServer()
	listenaddr := flag.String("l", "localhost:8081", "listen address")
	passwd := flag.String("p", "", "password")
	flag.BoolVar(&s.everybodyMaster, "everybodymaster", false,
		"grant every incoming connection full privileges. when false only the first connection is a master")
	flag.Parse()
	if *passwd != "" {
		s.SetPassword(*passwd)
	}
	err := s.Run(*listenaddr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", *listenaddr, err)
	}
	return
}
