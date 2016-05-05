// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"fmt"
	"os"
	"strings"
)

func printerr(err error) {
	fmt.Fprintf(os.Stderr, "%v\n", err)
	os.Exit(1)
}

func main() {
	//_, err := fmt.Println(os.Args[1:]...)
	// cannot use os.Args (type []string) as type []interface {} in function
	// argument
	// OHMYGOD GO WHAT IS WRONG WITH YOU
	_, err := fmt.Println(strings.Join(os.Args[1:], " "))
	if err != nil {
		printerr(err)
	}
}
