//> This file is part of Ymacs, an Emacs-like editor for the Web
//> http://www.ymacs.org/
//>
//> Copyright (c) 2009, Mihai Bazon, Dynarch.com.  All rights reserved.
//>
//> Redistribution and use in source and binary forms, with or without
//> modification, are permitted provided that the following conditions are
//> met:
//>
//>     * Redistributions of source code must retain the above copyright
//>       notice, this list of conditions and the following disclaimer.
//>
//>     * Redistributions in binary form must reproduce the above copyright
//>       notice, this list of conditions and the following disclaimer in
//>       the documentation and/or other materials provided with the
//>       distribution.
//>
//>     * Neither the name of Dynarch.com nor the names of its contributors
//>       may be used to endorse or promote products derived from this
//>       software without specific prior written permission.
//>
//> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
//> EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
//> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
//> PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE
//> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
//> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
//> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
//> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
//> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
//> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
//> THE POSSIBILITY OF SUCH DAMAGE.

// @require ymacs-tokenizer.js

Ymacs_Tokenizer.define("xml", function(stream, tok) {

        var $tags       = [],
            $cont       = [],
            $inTag      = null,
            $inComment  = null,
            PARSER      = { next: next, copy: copy, indentation: indentation };

        function INDENT_LEVEL() {
                return stream.buffer.getq("indent_level");
        };

        function foundToken(c1, c2, type) {
                tok.onToken(stream.line, c1, c2, type);
        };

        function isLetter(ch) {
                return ch.toLowerCase() != ch.toUpperCase();
        };

        function isNameStart(ch) {
                return ch && (isLetter(ch) || /^[:_-]$/.test(ch));
        };

        function isNameChar(ch) {
                return ch && (isLetter(ch) || /^[0-9_-]$/.test(ch));
        };

        function readName() {
                var col = stream.col, ch = stream.get(),
                    name = ch;
                while (!stream.eol()) {
                        ch = stream.peek();
                        if (!isNameChar(ch))
                                break;
                        name += ch;
                        stream.nextCol();
                }
                return ch && { line: stream.line, c1: col, c2: stream.col, id: name };
        };

        function readString(end) {
                var ch, esc = false, start = stream.col;
                while (!stream.eol()) {
                        ch = stream.peek();
                        if (ch === end && !esc) {
                                $cont.pop();
                                foundToken(start, stream.col, "string");
                                foundToken(stream.col, ++stream.col, "string-stopper");
                                return;
                        }
                        esc = !esc && ch === "\\";
                        stream.nextCol();
                }
                foundToken(start, stream.col, "string");
        };

        function readTag() {
                var ch = stream.peek(), name;
                if (stream.lookingAt(/^\x2f>/)) {
                        $cont.pop();
                        $inTag = null;
                        foundToken(stream.col, ++stream.col, "xml-closetag-slash");
                        foundToken(stream.col, ++stream.col, "xml-close-bracket");
                }
                else if (ch === ">") {
                        $cont.pop();
                        $tags.push($inTag);
                        $inTag = null;
                        foundToken(stream.col, ++stream.col, "xml-close-bracket");
                }
                else if (isNameStart(ch) && (name = readName())) {
                        foundToken(name.c1, name.c2, "xml-attribute");
                }
                else if (ch === '"' || ch === "'") {
                        foundToken(stream.col, ++stream.col, "string-starter");
                        $cont.push(readString.$C(ch));
                }
                else foundToken(stream.col, ++stream.col, null);
        };

        function readComment(type, end) {
                var line = stream.lineText(), pos = line.indexOf(end, stream.col);
                if (pos >= 0) {
                        $cont.pop();
                        foundToken(stream.col, pos, type);
                        $inComment = null;
                        foundToken(pos, pos += end.length, type + "-stopper");
                        stream.col = pos;
                } else {
                        foundToken(stream.col, line.length, type);
                        stream.col = line.length;
                }
        };

        function readCloseBracket() {
                var m = stream.lookingAt(/^([\s\xA0]*)(>?)/);
                if (m && m[0]) {
                        if (m[1])
                                foundToken(stream.col, stream.col += m[1].length, null);
                        if (m[2]) {
                                foundToken(stream.col, stream.col += m[2].length, "xml-close-bracket");
                                $cont.pop();
                        }
                } else {
                        foundToken(stream.col, ++stream.col, "error");
                }
        };

        function next() {
                stream.checkStop();
                if ($cont.length > 0)
                        return $cont.peek()();
                var ch = stream.peek(), m;
                if (stream.lookingAt("<![CDATA[")) {
                        foundToken(stream.col, stream.col += 9, "xml-cdata-starter");
                        $inComment = { line: stream.line, c1: stream.col };
                        $cont.push(readComment.$C("xml-cdata", "]]>"));
                }
                else if (stream.lookingAt("<!--")) {
                        foundToken(stream.col, stream.col += 4, "mcomment-starter");
                        $inComment = { line: stream.line, c1: stream.col };
                        $cont.push(readComment.$C("mcomment", "-->"));
                }
                else if (stream.lookingAt(/^<\x2f/) && isNameStart(stream.peek(+2))) {
                        foundToken(stream.col, ++stream.col, "xml-open-bracket");
                        foundToken(stream.col, ++stream.col, "xml-closetag-slash");
                        var tag = readName(), prev = $tags.pop();
                        foundToken(tag.c1, tag.c2, ( prev && prev.id == tag.id
                                                     ? "xml-close-tag"
                                                     : "error" ));
                        $cont.push(readCloseBracket);
                }
                else if (ch === "<" && isNameStart(stream.peek(+1))) {
                        foundToken(stream.col, ++stream.col, "xml-open-bracket");
                        var tag = readName();
                        foundToken(tag.c1, tag.c2, "xml-open-tag");
                        $inTag = tag;
                        $cont.push(readTag);
                }
                else if ((m = stream.lookingAt(/^&.*?;/))) {
                        foundToken(stream.col, ++stream.col, "xml-entity-starter");
                        foundToken(stream.col, stream.col += m[0].length - 2, "xml-entity");
                        foundToken(stream.col, ++stream.col, "xml-entity-stopper");
                }
                else if (ch === "&") {
                        foundToken(stream.col, ++stream.col, "error");
                }
                else {
                        foundToken(stream.col, ++stream.col, null);
                }
        };

        function copy() {
                var _tags = $tags.slice(0),
                    _cont = $cont.slice(0),
                    _inTag = $inTag,
                    _inComment = $inComment;
                return function() {
                        $cont = _cont.slice(0);
                        $tags = _tags.slice(0);
                        $inTag = _inTag;
                        $inComment = _inComment;
                        return PARSER;
                };
        };

        function indentation() {
                var indent, lastTag;
                if ($inComment) {
                        indent = stream.lineIndentation($inComment.line) + INDENT_LEVEL();
                }
                else if ($inTag) {
                        indent = $inTag.c1 + $inTag.id.length + 1;
                }
                else if ((lastTag = $tags.peek())) {
                        indent = stream.lineIndentation(lastTag.line) + INDENT_LEVEL();
                        // if current line begins with a closing tag, back one level
                        if (/^\s*<\x2f/.test(stream.lineText()))
                                indent -= INDENT_LEVEL();
                }
                return indent;
        };

        return PARSER;

});

DEFINE_SINGLETON("Ymacs_Keymap_XML", Ymacs_Keymap, function(D, P){

        D.KEYS = {
                "C-c /"  : "xml_close_tag",
                "ENTER"  : "newline_and_indent"
        };

});

Ymacs_Buffer.newMode("xml_mode", function(){

        var tok = this.tokenizer;
        this.setTokenizer(new Ymacs_Tokenizer({ buffer: this, type: "xml" }));
        var keymap = Ymacs_Keymap_XML();
        this.pushKeymap(keymap);
        var changed_vars = this.setq({ indent_level: 2 });
        return function() {
                this.setTokenizer(tok);
                this.popKeymap(keymap);
                this.setq(changed_vars);
        };

});

Ymacs_Buffer.newCommands({

        xml_close_tag: Ymacs_Interactive(function() {
                this.cmd("close_last_xml_tag");
                this.cmd("indent_line");
        })

});
