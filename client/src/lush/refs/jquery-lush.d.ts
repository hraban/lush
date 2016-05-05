// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// Type defs for lush extensions to JQuery

/// <reference path="jquery.d.ts"/>
/// <reference path="jqueryui.d.ts"/>

interface JQuery {
    tabsBottom(options?: JQueryUI.TabsOptions): JQuery;
    serializeObject(): { [key: string]: string };
    assertNum(n: number): JQuery;
}
