import asyncio
import sys
import jmcomic


async def main():
    # Get album ID from Laravel
    album_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not album_id:
        print("ERROR: Album ID is required.", file=sys.stderr)
        return 1
    try:
        # Download the album asynchronously.
        album, downloader = await jmcomic.download_album_async(album_id)
        # Report any failed images if available.
        if downloader.download_failed_image:
            print(
                f"WARNING: Album {album_id} downloaded "
                f"with failed images: {downloader.download_failed_image}",
                file=sys.stderr,
            )
        # Tell Laravel that the download completed.
        print(f"SUCCESS: Album {album_id} downloaded.")
        return 0
    except Exception as e:
        # Tell Laravel that the download failed.
        print(
            f"ERROR: Failed to download album {album_id}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
