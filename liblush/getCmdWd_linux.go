// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// +build linux

package liblush

import (
	"os"
	"strconv"
)

const GETCMDWD_SUPPORTED = true

func getCmdWd(c *cmd) (string, error) {
	pid := c.execCmd.Process.Pid
	return os.Readlink("/proc/" + strconv.Itoa(pid) + "/cwd")
}
