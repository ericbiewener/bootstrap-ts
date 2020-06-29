import createProgressStream, { Progress } from 'progress-stream'
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import got from 'got'
import { log } from 'log-all-the-things'
import { createDir } from 'utlz'

const DEBUG_LIMIT = false

const DOWNLOADS_DIR = path.join(__dirname, '../downloads')

const downloads: Record<string, Progress> = {}

const updateOutput = (title: string, progress: Progress) => {
  const oldLineCount = Object.keys(downloads).length

  downloads[title] = progress

  const output = []
  let maxTitleLength = 0
  for (const k in downloads) maxTitleLength = Math.max(maxTitleLength, k.length)
  for (const k in downloads) {
    const downloadProgress = downloads[k]
    const paddedTitle = `${k}`.padEnd(maxTitleLength + 5) // +1 for colon

    if (downloadProgress.percentage === 100) {
      output.push(`${paddedTitle} Done`)
    } else {
      const value = Math.round(downloadProgress.transferred / 100000) / 10
      output.push(`${paddedTitle} ${value.toLocaleString()} MB`)
    }
  }

  if (oldLineCount) {
    readline.cursorTo(process.stdout, 0)
    readline.moveCursor(process.stdout, 0, -oldLineCount)
    readline.clearScreenDown(process.stdout)
  }

  process.stdout.write(output.join('\n'))
}

const downloadFile = (url: string, dir: string, title: string) =>
  new Promise((resolve) => {
    const rsp = got.stream(url, {
      headers: {
        'Content-Disposition': 'attachment',
        filename: 'filename',
      },
    })

    // const progressBar = multibar.create()

    const progressStream = createProgressStream({ time: 1000 })
    progressStream.on('progress', (progress) => updateOutput(title, progress))

    const file = fs.createWriteStream(path.join(dir, title))
    const stream = rsp.pipe(progressStream).pipe(file)
    stream.on('finish', resolve)
  })

;(async () => {
  const browser = await puppeteer.launch()

  try {
    const page = await browser.newPage()

    const goto = async (url: string) => {
      await page.goto(url, { waitUntil: 'networkidle0' })
      return page.title()
    }

    const rootTitle = await goto('https://www.instagram.com/barrys/channel/')
    const videoDir = createDir(DOWNLOADS_DIR, rootTitle)

    const hrefs = await page.$$eval('[href^="/tv"', (anchorTags: any) =>
      anchorTags.map((a: HTMLAnchorElement) => a.href),
    )

    const videoData = []

    const finalHrefs = DEBUG_LIMIT ? hrefs.slice(0, 2) : hrefs

    for (const href of finalHrefs) {
      const title = await goto(href)
      const src = await page.$eval('video', (video: any) => video.src)
      videoData.push({ title, src })
    }

    await Promise.all(
      videoData.map(({ title, src }) => downloadFile(src, videoDir, `${title}.mp4`)),
    )
  } catch (e) {
    log().red(e)
  } finally {
    browser.close()
    process.exit()
  }
})()
