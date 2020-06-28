import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import got from 'got'
import { log } from 'log-all-the-things'
import { createDir } from 'utlz'

const DOWNLOADS_DIR = path.join(__dirname, '../downloads')

const downloadFile = (url: string, filepath: string) =>
  new Promise((resolve) => {
    const rsp = got.stream(url, {
      headers: {
        'Content-Disposition': 'attachment',
        filename: 'filename',
      },
    })

    const file = fs.createWriteStream(filepath)
    const stream = rsp.pipe(file)
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

    for (const href of hrefs) {
      const title = await goto(href)
      const src = await page.$eval('video', (video: any) => video.src)
      videoData.push({ title, src })
    }

    log().yellow(JSON.stringify(videoData))

    await Promise.all(
      videoData.map(({ title, src }) => {
        log().green(`Downloading "${title}"`)
        return downloadFile(src, path.join(videoDir, `${title}.mp4`))
      }),
    )
  } catch (e) {
    log().red(e)
  } finally {
    browser.close()
    process.exit()
  }
})()
