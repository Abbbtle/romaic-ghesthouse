import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIcalFetcher, isPrivateAddress, type FetchLike, type HostResolver } from "./ical-fetcher";

// Every request here goes to a fake fetch: no real calendar link is ever fetched.

const link = "https://admin.booking.com/hotel/hoteladmin/ical.html?t=secret-token";
const calendar = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
const none = { etag: null, lastModified: null };
const publicResolver: HostResolver = async () => ["93.184.216.34"];

function fakeFetch(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return { fetch, calls };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe("fetching a channel calendar", () => {
  it("fetches an allowed link, asking conditionally, and keeps the validators", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(calendar, { headers: { etag: '"v2"', "last-modified": "Thu, 12 Nov 2026 07:00:00 GMT" } }));
    const fetcher = createIcalFetcher({ fetch, resolve: publicResolver });
    const fetched = await fetcher.fetchCalendar(link, { etag: '"v1"', lastModified: "Wed, 11 Nov 2026 07:00:00 GMT" });
    assert.deepEqual(fetched, { status: "fetched", text: calendar, etag: '"v2"', lastModified: "Thu, 12 Nov 2026 07:00:00 GMT" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init.redirect, "manual");
    assert.equal(header(calls[0]!.init, "if-none-match"), '"v1"');
    assert.equal(header(calls[0]!.init, "if-modified-since"), "Wed, 11 Nov 2026 07:00:00 GMT");
  });

  it("answers not-modified for a 304", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 304 }));
    assert.deepEqual(await createIcalFetcher({ fetch, resolve: null }).fetchCalendar(link, { etag: '"v1"', lastModified: null }), { status: "not-modified" });
  });

  it("refuses links that aren't a channel's own https link before fetching anything", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(calendar));
    const fetcher = createIcalFetcher({ fetch, resolve: publicResolver });
    for (const url of [
      "http://admin.booking.com/ical",
      "https://example.com/booking.ics",
      "https://booking.com.evil.example/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://user:pw@admin.booking.com/x",
      "https://admin.booking.com:444/x",
      "file:///etc/passwd",
      "not a url",
    ]) {
      const result = await fetcher.fetchCalendar(url, none);
      assert.equal(result.status, "failed", url);
    }
    assert.equal(calls.length, 0);
  });

  it("refuses a host whose addresses are private or loopback", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(calendar));
    for (const addresses of [["10.0.0.5"], ["93.184.216.34", "127.0.0.1"], ["::1"], ["fd00::1"], []]) {
      const result = await createIcalFetcher({ fetch, resolve: async () => addresses }).fetchCalendar(link, none);
      assert.equal(result.status, "failed", addresses.join());
    }
    assert.equal(calls.length, 0);
  });

  it("follows at most three redirects, checking each one before following it", async () => {
    const hops = (locations: string[]) =>
      fakeFetch((url) => {
        const index = Number(new URL(url).searchParams.get("hop") ?? "0");
        const next = locations[index];
        return next ? new Response(null, { status: 302, headers: { location: next } }) : new Response(calendar);
      });

    const fine = hops(["https://ical.booking.com/a?hop=1", "/b?hop=2", "https://ical.booking.com/c?hop=3"]);
    assert.equal((await createIcalFetcher({ fetch: fine.fetch, resolve: null }).fetchCalendar(link, none)).status, "fetched");
    assert.deepEqual(fine.calls.map((call) => new URL(call.url).pathname), ["/hotel/hoteladmin/ical.html", "/a", "/b", "/c"]);

    const tooMany = hops(["https://ical.booking.com/a?hop=1", "/b?hop=2", "/c?hop=3", "/d?hop=4"]);
    const result = await createIcalFetcher({ fetch: tooMany.fetch, resolve: null }).fetchCalendar(link, none);
    assert.deepEqual(result.status === "failed" && /too many redirects/.test(result.reason), true);
    assert.equal(tooMany.calls.length, 4);

    for (const target of ["https://evil.example/x", "http://admin.booking.com/x", "https://169.254.169.254/latest/meta-data"]) {
      const away = fakeFetch(() => new Response(null, { status: 301, headers: { location: target } }));
      assert.equal((await createIcalFetcher({ fetch: away.fetch, resolve: null }).fetchCalendar(link, none)).status, "failed", target);
      assert.equal(away.calls.length, 1, target);
    }

    const resolvedInward = fakeFetch((url) => (url === link ? new Response(null, { status: 302, headers: { location: "https://inside.booking.com/x" } }) : new Response(calendar)));
    const resolver: HostResolver = async (host) => (host === "inside.booking.com" ? ["192.168.1.10"] : ["93.184.216.34"]);
    assert.equal((await createIcalFetcher({ fetch: resolvedInward.fetch, resolve: resolver }).fetchCalendar(link, none)).status, "failed");
    assert.equal(resolvedInward.calls.length, 1);
  });

  it("stops at 1 MB, whether the size is declared or not", async () => {
    const declared = fakeFetch(() => new Response("BEGIN:VCALENDAR", { headers: { "content-length": "2000000" } }));
    const result = await createIcalFetcher({ fetch: declared.fetch, resolve: null }).fetchCalendar(link, none);
    assert.ok(result.status === "failed" && /1 MB/.test(result.reason));

    const chunk = new TextEncoder().encode("X".repeat(64 * 1024));
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const streamed = fakeFetch(() => new Response(endless));
    const streamedResult = await createIcalFetcher({ fetch: streamed.fetch, resolve: null }).fetchCalendar(link, none);
    assert.ok(streamedResult.status === "failed" && /1 MB/.test(streamedResult.reason));
    assert.ok(sent <= 20, `read ${sent} chunks`);
  });

  it("gives up after its time limit", async () => {
    const hanging = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        }),
    );
    const result = await createIcalFetcher({ fetch: hanging.fetch, resolve: null, timeoutMs: 20 }).fetchCalendar(link, none);
    assert.ok(result.status === "failed" && /too long/.test(result.reason));
  });

  it("calls a page that isn't a calendar, or an error status, a failure, in words without the link", async () => {
    const cases: [Response, RegExp][] = [
      [new Response("<html>Sign in</html>"), /didn't give us a calendar/],
      [new Response("gone", { status: 404 }), /doesn't work any more/],
      [new Response("slow down", { status: 429 }), /slow down/],
      [new Response("oops", { status: 503 }), /error 503/],
      [new Response(null, { status: 302 }), /status 302/],
    ];
    for (const [response, reason] of cases) {
      const { fetch } = fakeFetch(() => response);
      const result = await createIcalFetcher({ fetch, resolve: null }).fetchCalendar(link, none);
      assert.ok(result.status === "failed", String(reason));
      assert.match(result.reason, reason);
      assert.ok(!result.reason.includes("secret-token") && !result.reason.includes("https://"));
    }
    const { fetch } = fakeFetch(() => {
      throw new TypeError(`fetch failed for ${link}`);
    });
    const thrown = await createIcalFetcher({ fetch, resolve: null }).fetchCalendar(link, none);
    assert.ok(thrown.status === "failed" && !thrown.reason.includes("secret-token"));
  });

  it("doesn't keep validators longer than the database holds", async () => {
    const { fetch } = fakeFetch(() => new Response(calendar, { headers: { etag: `"${"x".repeat(300)}"` } }));
    const result = await createIcalFetcher({ fetch, resolve: null }).fetchCalendar(link, none);
    assert.ok(result.status === "fetched" && result.etag === null);
  });
});

describe("private addresses", () => {
  it("are every range a public server is never at", () => {
    for (const address of ["0.0.0.0", "10.1.2.3", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.0.0.8", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "not an address", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "2002:7f00:1::1", "2002:c0a8:1::", "2001:0:4136:e378::1", "fec0::1", "0:0:0:0:0:ffff:7f00:1", "1::2::3"]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
    for (const address of ["93.184.216.34", "172.32.0.1", "100.128.0.1", "2a00:1450:4001:80e::200e", "::ffff:93.184.216.34", "::ffff:5db8:d822", "64:ff9b::5db8:d822", "2002:5db8:d822::1", "2606:4700::6810:84e5"]) {
      assert.equal(isPrivateAddress(address), false, address);
    }
  });
});
