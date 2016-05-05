// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// +build !linux

package liblush

import (
	"errors"
	"runtime"
)

const GETCMDWD_SUPPORTED = false

func getCmdWd(c *cmd) (string, error) {
	return "", errors.New(
		"getting working directory of child unsupported on " + runtime.GOOS)
}
