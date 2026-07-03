"use strict";

const { balanced } = require("balanced-match");

const escSlash = `\0SLASH${Math.random()}\0`;
const escOpen = `\0OPEN${Math.random()}\0`;
const escClose = `\0CLOSE${Math.random()}\0`;
const escComma = `\0COMMA${Math.random()}\0`;
const escPeriod = `\0PERIOD${Math.random()}\0`;
const escSlashPattern = new RegExp(escSlash, "g");
const escOpenPattern = new RegExp(escOpen, "g");
const escClosePattern = new RegExp(escClose, "g");
const escCommaPattern = new RegExp(escComma, "g");
const escPeriodPattern = new RegExp(escPeriod, "g");
const slashPattern = /\\\\/g;
const openPattern = /\\{/g;
const closePattern = /\\}/g;
const commaPattern = /\\,/g;
const periodPattern = /\\\./g;
const EXPANSION_MAX = 100000;

function numeric(str) {
  return !Number.isNaN(Number(str)) ? Number.parseInt(str, 10) : str.charCodeAt(0);
}

function escapeBraces(str) {
  return str
    .replace(slashPattern, escSlash)
    .replace(openPattern, escOpen)
    .replace(closePattern, escClose)
    .replace(commaPattern, escComma)
    .replace(periodPattern, escPeriod);
}

function unescapeBraces(str) {
  return str
    .replace(escSlashPattern, "\\")
    .replace(escOpenPattern, "{")
    .replace(escClosePattern, "}")
    .replace(escCommaPattern, ",")
    .replace(escPeriodPattern, ".");
}

function parseCommaParts(str) {
  if (!str) return [""];
  const parts = [];
  const match = balanced("{", "}", str);
  if (!match) return str.split(",");

  const chunks = match.pre.split(",");
  chunks[chunks.length - 1] += `{${match.body}}`;
  const postParts = parseCommaParts(match.post);
  if (match.post.length) {
    chunks[chunks.length - 1] += postParts.shift();
    chunks.push(...postParts);
  }
  parts.push(...chunks);
  return parts;
}

function expand(str, options = {}) {
  if (!str) return [];
  const max = options.max ?? EXPANSION_MAX;
  const escaped = str.slice(0, 2) === "{}" ? `\\{\\}${str.slice(2)}` : str;
  return expandInternal(escapeBraces(escaped), max, true).map(unescapeBraces);
}

function embrace(str) {
  return `{${str}}`;
}

function isPadded(value) {
  return /^-?0\d/.test(value);
}

function expandInternal(input, max, isTop) {
  let str = input;
  const expansions = [];

  for (;;) {
    const match = balanced("{", "}", str);
    if (!match) return [str];

    const pre = match.pre;
    if (/\$$/.test(pre)) {
      const post = match.post.length ? expandInternal(match.post, max, false) : [""];
      for (let index = 0; index < post.length && index < max; index += 1) {
        expansions.push(`${pre}{${match.body}}${post[index]}`);
      }
      return expansions;
    }

    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(match.body);
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(match.body);
    const isSequence = isNumericSequence || isAlphaSequence;
    const isOptions = match.body.includes(",");

    if (!isSequence && !isOptions) {
      if (match.post.match(/,(?!,).*\}/)) {
        str = `${pre}{${match.body}}${escClose}${match.post}`;
        isTop = true;
        continue;
      }
      return [str];
    }

    const post = match.post.length ? expandInternal(match.post, max, false) : [""];
    let values;
    if (isSequence) {
      values = match.body.split(/\.\./);
    } else {
      values = parseCommaParts(match.body);
      if (values.length === 1 && values[0] !== undefined) {
        values = expandInternal(values[0], max, false).map(embrace);
        if (values.length === 1) return post.map((item) => pre + values[0] + item);
      }
    }

    let normalized;
    if (isSequence && values[0] !== undefined && values[1] !== undefined) {
      const first = numeric(values[0]);
      const last = numeric(values[1]);
      const width = Math.max(values[0].length, values[1].length);
      let increment = values.length === 3 && values[2] !== undefined
        ? Math.max(Math.abs(numeric(values[2])), 1)
        : 1;
      const reverse = last < first;
      if (reverse) increment *= -1;
      const compare = reverse ? (left, right) => left >= right : (left, right) => left <= right;
      const pad = values.some(isPadded);
      normalized = [];

      for (let value = first; compare(value, last) && normalized.length < max; value += increment) {
        let item;
        if (isAlphaSequence) {
          item = String.fromCharCode(value);
          if (item === "\\") item = "";
        } else {
          item = String(value);
          if (pad) {
            const needed = width - item.length;
            if (needed > 0) {
              const zeros = "0".repeat(needed);
              item = value < 0 ? `-${zeros}${item.slice(1)}` : `${zeros}${item}`;
            }
          }
        }
        normalized.push(item);
      }
    } else {
      normalized = [];
      for (const value of values) {
        normalized.push(...expandInternal(value, max, false));
      }
    }

    for (const value of normalized) {
      for (let index = 0; index < post.length && expansions.length < max; index += 1) {
        const expansion = pre + value + post[index];
        if (!isTop || isSequence || expansion) expansions.push(expansion);
      }
    }
    return expansions;
  }
}

module.exports = expand;
module.exports.expand = expand;
module.exports.EXPANSION_MAX = EXPANSION_MAX;
