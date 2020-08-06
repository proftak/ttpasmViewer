#!/usr/bin/node
"use strict";

const fs = require('fs')
const beautify = require('json-beautify')
const process = require('process')
const csExtendsTo = "extendsTo"

function processArgv(argv)
{
  let result = { sources: [] }
  if (argv.length >= 2) 
  {
    argv.shift()
    argv.shift()
  }
  while (argv.length)
  {
    console.log(`processArgv now processes ${argv[0]}`)
    if (0)
    {
    }
    else
    {
      let fp = argv[0]
      if (fs.existsSync(fp))
      {
        result.sources.push(fp)
      }
      else
      {
        console.log(`${fp} as an input file does not exist`)
        process.exit(1)
      }
      argv.shift()
    }
  }
  return result
}

let args = processArgv(process.argv)

const ltLabelDef = "labelDef"
const ltMne0 = "mne0"
const ltMne1 = "mne1"
const ltMne2 = "mne2"
const ltComment = "comment"
const ltBadline = "bad line"
const lineRegexes = [
  { regex: new RegExp(`^\\s*(?<${ltComment}>\\/\\/.*)?$`), type: ltComment },
  { regex: new RegExp(`^\\s*(?<label>\\w+:)(\\s(?<labelValue>[^\\/]*))?\\s*(?<${ltComment}>\\/\\/.*)?$`), type: ltLabelDef },
  { regex: new RegExp(`^\\s*(?<mne0>\\w+)\\s*(?<${ltComment}>\\/\\/.*)?$`), type: ltMne0 },
  { regex: new RegExp(`^\\s*(?<mne1>\\w+)\\s+(?<operand0>\\w[^,\\/]*)\\s*((?<${ltComment}>\\/\\/.*)?)$`), type: ltMne1 },
  { regex: new RegExp(`^\\s*(?<mne2>\\w+)\\s+(?<operand0>[^,]+)\\s*,\\s*(?<operand1>[^\\/]+)(\\s*(?<${ltComment}>\\/\\/.*)?)$`), type: ltMne2 },
  { regex: new RegExp(`^.*$`), type: ltBadline }
]

function trim(string)
{
  let result
  if (string != undefined)
  {
    result = string
    result = result.replace(/\s+/g,' ')
    result = result.replace(/^\s*/,'')
    result = result.replace(/\s*$/,'')
  }
  else
  {
    result = string
  }
  return result
}

function parseFile(fp)
{
  let lines = fs.readFileSync(fp, { encoding: 'utf8' }).split("\n")
  lines.splice(-1,1) // remove last "line"
  let lineRegex = null
  let result = []

  lines.forEach(
    ln =>
    {
//      console.log(ln)
      let match = null
      for (let i=0; match == null && i < lineRegexes.length; ++i)
      {
        match = ln.match(lineRegexes[i].regex)
        if (match != null)
        {
          lineRegex = lineRegexes[i]
          let groups = match['groups']
          if (groups == undefined)
          {
            throw new Error(`groups is undefined when parsing "${ln}"`)
          }
          Object.getOwnPropertyNames(groups).forEach
          (
            n =>
            groups[n] = trim(groups[n])
          )
          let objToPush = { 
            original: ln,         // actual line content
            lineRegex: lineRegex, // the template of regex that matches
            components: groups    // decomposed groups (canonical)
          }
//          console.log(objToPush)
          result.push( objToPush )
        }
      }
    }
  )
  return { 
    filePath: fp,   // string of the file path
    parsed: result  // array of objects representing parsed result
                    // one object for each line
  }
}

let parsedSources = []
args.sources.forEach(
  src =>
  {
    parsedSources.push(parseFile(src))
  }
)

// now we have parsed files to compare and process
//
// idea: use a matrix, but this method only works well for 2 files
// another method is to maintain a list of identical lines, and line 
// sequencing make lines of the same content unique. this relies on
// scanning all files involved to determine which lines are unique
//
// start by identifying lines that are identical across all files and
// organize them into chunks, these can serve as anchor points
//
// next, try to combine chunks using the following methods
// * line block insert
//   * this happens when two identical chunks C1 and C2 are
//     contiguous in at least one fire, and in all other files
//     C1 and C2 are separated by a group of lines
// * line block delete
//   * this happens 
// * line block change
// 
// Take comments out first, then initialize the seed chunks
//

function removeComments(parsedSource)
{
  let lineNumber = 0
  let result = []
  parsedSource.parsed.forEach(
    line =>
    {
      if (line.lineRegex.type == ltComment)
      {
        // ignore
      }
      else
      {
        result.push(
          {
            lineNumber: lineNumber,
            parsedSource: line
          }
        )
      }
      lineNumber++
    }
  )
  return { filePath: parsedSource.filePath, source: result }
}

function parsedSourceEq(p1, p2)
{
  let result = false
  if (p1.lineRegex == p2.lineRegex)
  {
    result = true
    Object.getOwnPropertyNames(p1.components).forEach
    (
      n =>
      {
        if (n != ltComment)
        {
//          console.log(`now checking ${n} ${p2.components[n]} vs ${p1.components[n]}`)
          result =  result &&
            (
              (n in p2.components) && 
              (p2.components[n]  == p1.components[n])
            )
        }
      }
    )
  }
//  console.log(beautify(p1,null,2,80))
//  console.log(beautify(p2,null,2,80))
//  console.log(`are the same: ${result}`)
  return result
}

function parsedSourceLinesEq(a1,a2)
{
  let result = false
  if (a1.length == a2.length)
  {
    let diffElement =
      a1.find(
        (e,i,a) =>
        {
          return !parsedSourceEq(e,a2[i])
        }
      )
    result = (diffElement == undefined)
  }
  return result
}

function matchChunk(noCommentSource, sourceIndex, chunk)
{
  // noCommentSource:
  //   filePath
  //   source:
  // sourceIndex is an index to source
  // each source element is
  //   lineNumber
  //   parsedSource
  //     original
  //     lineRegex
  //     components
  // chunk is a chunk
  // content
  //   [x]: lineRegex
  //        components
  // foundIn
  //   [x]: filePath
  //        startLine
  // return true if there is a match, update updates chunk if necessary
  //
  
  // first, see if chunk already has this entry
  let result = false
  let foundInEntry = chunk.foundIn.find(
    (e, i, a) =>
    {
      return (e.filePath == noCommentSource.filePath) && (e.startLine == sourceIndex)
    }
  )
  result = foundInEntry != undefined
  if (!result && (sourceIndex + chunk.content.length <= noCommentSource.source.length))
  {
    // not already in this chunk, let see if there is a match
    let notMatchItem = chunk.content.find(
      (e, i, a) =>
      {
        return !parsedSourceEq(
          e,
          noCommentSource.source[sourceIndex+i].parsedSource
        )
      }
    )
    result = (notMatchItem == undefined)
    if (result)
    {
      // if there is a match, add an entry to the chunk
      chunk.foundIn.push(
        { noCommentSource: noCommentSource, startLine: sourceIndex }
      )
    }
  }
  return result
}

function matchChunks(noCommentSource, sourceIndex, chunks, length)
{
  // try to match source lines to chunks, length of each chunk is length
  let foundChunk = chunks.find(
    (e, i, a) =>
    {
      return matchChunk(noCommentSource, sourceIndex, e)
    }
  )
  if (foundChunk == undefined)
  {
    // now create the chunk and push it
    let chunkContent = []
    for (
      let i = sourceIndex;
      i < sourceIndex + length;
      ++i
    )
    {
      chunkContent.push(
        {
          lineRegex: noCommentSource.source[i].parsedSource.lineRegex,
          components: noCommentSource.source[i].parsedSource.components
        }
      )
    }
    chunks.push(
      {
        content: chunkContent,
        foundIn:
        [
          {
            noCommentSource: noCommentSource,
            startLine: sourceIndex
          }
        ]
      }
    )
  }
  return chunks
}

// chunks is an array, each
function initChunks(noCommentSource, chunks)
{
  // noCommentSource looks like this
  // filePath
  // source 
  //   [x]: lineNumber
  //        parsedSource
  //             original
  //             lineRegex
  //             components
  // chunks is an array, 
  // [x]: content
  //        [x]: lineRegex
  //             components
  //      foundIn
  //        [x]: filePath
  //             startLine

  for (
    let lineIndex = 0; 
    lineIndex < noCommentSource.source.length; 
    ++lineIndex)
  {
    matchChunks(
      noCommentSource,
      lineIndex,
      chunks,
      1
    )
  }
  return chunks
}

let noCommentSources = []
parsedSources.forEach(
  p =>
  {
//    console.log(`parsedSource ${p.filePath}`)
    noCommentSources.push(removeComments(p))
  }
)

let chunks = []
noCommentSources.forEach(
  n =>
  {
    initChunks(n, chunks)
//    console.log(`after chunking ${n.filePath}\n${beautify(chunks,null,2,80)}`)
  }
)

function growChunk(smallerChunk)
{
  // smallerChunk:
  //   content: 
  //     [x]: lineRegex
  //          components
  //   foundIn:
  //     [x]: noCommentSource
  //          startLine
  //   extendsTo:
  //     [x]: type chunks
  // noCommentSource:
  //   filePath
  //   source:
  //     [x]: lineNumber
  //          parsedSource
  //            original
  //            lineRegex
  //            components
//  console.log(`growChunk has ${smallerChunk.foundIn.length} foundIns`)
  let biggerChunks = []
  let eligibleSmallerFoundIns = 
    smallerChunk.foundIn.filter(
      e =>
      {
        return (
          (e.noCommentSource.source.length >=
           e.startLine + smallerChunk.content.length+1)
        )
      }
    )
//  console.log(eligibleSmallerFoundIns)
//  console.log(`growChunk finds ${eligibleSmallerFoundIns.length} eligibles`)
  eligibleSmallerFoundIns.forEach(
    e =>
    {
      // add one line and see if
      //   A: it is another foundIn in one of the biggerChunks, or
      //   B: it is a new one
      let extensionChunk
      if (csExtendsTo in smallerChunk)
      {
        // we already have some extension chunks, check to see one
        // matches, only need to check the last line because these
        // are extensions of smallerChunk
        extensionChunk = smallerChunk.extendsTo.find(
          (e1) =>
          {
            return parsedSourceEq(
              e.noCommentSource.source[e.startLine+smallerChunk.content.length].parsedSource,
              e1.content[e1.content.length-1]
            )
          }
        )
      }
      else
      {
        smallerChunk[csExtendsTo] = []
      }
      if (extensionChunk == undefined)
      {
        // there are no extension chunks that apply
        // time to create one
        extensionChunk = {
          content: [
            ...smallerChunk.content, 
            {
              lineRegex: e.noCommentSource.source[e.startLine+smallerChunk.content.length].parsedSource.lineRegex,
              components: e.noCommentSource.source[e.startLine+smallerChunk.content.length].parsedSource.components
            }
          ],
          foundIn: [
            {
              noCommentSource: e.noCommentSource,
              startLine: e.startLine
            }
          ]
        }
        smallerChunk[csExtendsTo].push(extensionChunk)
      }
      else 
      {
        // an extensionChunk already exists
        // check to see if we need a new foundIn
        let foundIn = extensionChunk.foundIn.find(
          (e1,i1,a1) =>
          {
            return (e.noCommentSource == e1.noCommentSource) &&
                   (e.startLine == e1.startLine)
          }
        )
        if (foundIn == undefined)
        {
          // no current foundIn entries match, time to create one
          extensionChunk.foundIn.push(
            {
              noCommentSource: e.noCommentSource,
              startLine: e.startLine
            }
          )
        }
      }
    }
  )
  return (csExtendsTo in smallerChunk) ? smallerChunk[csExtendsTo] : []
}

function chunksToString(chunks, indentation='')
{
  let output = ''
  chunks.forEach(
    chunk =>
    {
      output += `${indentation}chunk:\n`
      output += `  ${indentation}Content:\n`
      chunk.content.forEach(
        line =>
        {
          output += `    ${indentation}${JSON.stringify(line.components)}\n`
        }
      )
      output += `  ${indentation}foundIn\n`
      chunk.foundIn.forEach(
        foundIn =>
        {
//          console.log(foundIn)
          output += `    ${indentation}${foundIn.noCommentSource.filePath}: ${foundIn.startLine} -> ${foundIn.noCommentSource.source[foundIn.startLine].lineNumber}\n`
        }
      )
      if (csExtendsTo in chunk && chunk[csExtendsTo].length > 0)
      {
        output += `  ${indentation}extendsTo\n`
        output += chunksToString(chunk[csExtendsTo],`    ${indentation}`)
      }
    }
  )
  return output
}

//console.log(chunksToString(chunks,''))

function buildChunkForest(chunks)
{
  let length = 2
  let chunksBeingProcessed = chunks
  do
  {
    let biggerChunks = []
//    console.log(`from original chunks\n${chunksToString(chunks)}`)
//    console.log(`chunks being processed in this iteration\n${chunksToString(chunksBeingProcessed)}`)
    chunksBeingProcessed.forEach(
      chunk =>
      {
        biggerChunks = biggerChunks.concat(
          growChunk(chunk).filter(
            biggerChunk =>
            {
//              console.log(`return value of growChunk is ${chunksToString([biggerChunk])}`)
              return biggerChunk.foundIn.length > 1
            }
          )
        )
//        console.log(`biggerChunks now has ${chunksToString(biggerChunks)}`)
      }
    )
//    console.log(`biggerChunks finally has ${chunksToString(biggerChunks)}`)
    chunksBeingProcessed = biggerChunks
//    console.log(`remaining length is ${chunksBeingProcessed.length}`)
  }
  while (chunksBeingProcessed.length > 0)
  return chunks
}

buildChunkForest(chunks)

console.log(chunksToString(chunks,''))


