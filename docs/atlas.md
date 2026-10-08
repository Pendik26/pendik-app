# MongoDB Atlas cluster

The database behind accounts, sync, the leaderboard, the AI allowance and the
Class Drive cache runs on MongoDB Atlas. This page describes the cluster
itself: where it runs, how it's built, what it can take and how to scale it.
What the app stores in it is in [Database](database.md).

## At a glance

| | |
| --- | --- |
| Atlas project | one project, one cluster (`Cluster0`) |
| Tier | **M0** (free, shared) |
| Cloud and region | AWS `ap-southeast-1` (Singapore) |
| MongoDB version | 8.0, upgraded by Atlas |
| Topology | replica set of 3 members, no sharding |
| Database | `medicine` (9 collections, 23 indexes) |
| App user | `medicine-app`: `readWrite` on `medicine`, scoped to `Cluster0` |
| Connection | `mongodb+srv://cluster0.jbgup5e.mongodb.net` (TLS) |
| Used (October 2026) | 0.4 MB data, 0.7 MB storage, 0.8 MB indexes, of 512 MB |

## The stack

```text
 student's browser
   │  static pages, JS, content        (Vercel CDN, worldwide)
   │  /api/*                           (one Vercel Function, region sin1)
   ▼
 api/index.ts ── server/app.ts ── stores (progress, leaderboard, ai, drive,
   │                                       Better Auth's adapter)
   │  MongoDB Node driver 7, one client per function instance,
   │  pool of 5, TLS, SCRAM auth, retryable reads and writes
   ▼
 cluster0.jbgup5e.mongodb.net  (DNS SRV record → the three members)
   ├── member 0 ┐
   ├── member 1 ├─ replica set: one primary, two secondaries,
   └── member 2 ┘  in different availability zones of ap-southeast-1
```

- **Vercel and Atlas are in the same city.** The function runs in `sin1`
  (`vercel.json`) and the cluster in AWS Singapore, so a query takes a few
  milliseconds. Keep them together: moving one without the other adds a
  round trip to every request.
- **Reads and writes go to the primary** (the driver's default read
  preference). Writes are acknowledged by a majority of members
  (`w=majority` in the connection string), so an acknowledged write survives
  the loss of any one server.
- **Failover is automatic.** If the primary goes down, the other two elect a
  new one within seconds. The driver finds it through the SRV record and
  retries the failed operation once (`retryWrites=true`, retryable reads on
  by default). A request caught in the middle may fail; the browser keeps its
  changes and the next sync sends them again.

## Server structure

An M0 cluster is a replica set on shared hardware: Atlas runs it on servers
that host other free clusters too, and manages them entirely. There is no
server to log in to and nothing to patch.

- **Three members** (`ac-…-shard-00-00`, `-01`, `-02` under the cluster's
  host), each with a full copy of the data. The SRV record lists them, so
  the connection string never names a member.
- **Storage engine:** WiredTiger, with compression; storage size is the
  compressed size on disk.
- **Security:** TLS is required on every connection; users authenticate with
  SCRAM. The app's user can read and write the `medicine` database and
  nothing else.

### Network access

The project's IP access list has `0.0.0.0/0`, because Vercel Functions have
no fixed outgoing addresses. The database user's password is then the
protection, so keep `MONGODB_URI` only in Vercel's environment variables and
rotate the password if it's ever exposed. A single-address entry left by
Atlas's first-time setup can be removed. Allowing only Vercel's addresses
needs a paid Vercel feature that gives functions fixed outgoing IPs (Secure
Compute or static IPs).

### Database users

- `medicine-app`: the app's user, `readWrite` on `medicine`, scoped to
  `Cluster0`. Its password is in `MONGODB_URI`.
- An admin user created during Atlas's first-time setup. The app never uses
  it; keep its password out of the repo, or delete it and use the Atlas
  website for admin work.

## What M0 can take

| Limit (M0) | This app |
| --- | --- |
| 512 MB storage | under 1 MB now; a student is roughly 20 to 60 KB |
| 500 connections | up to 5 per function instance, idle ones closed after 60 s |
| about 100 operations a second | a sync is 3 to 5 operations, a Drive request usually none |
| 10 GB in and 10 GB out every 7 days | a sync is a few KB; the Drive cache is read once per cold start |
| no backups, no Performance Advisor | progress also lives in browsers and exports; see Operations |

At these rates M0 holds a whole class, or several: a few hundred students
come to around 25 MB, and even everyone syncing at the same minute stays well
under the operation limit because syncs are spread out (4 s after a change,
then every 5 minutes).

Atlas pauses a free cluster after 60 days with no connections. Any request
from the app counts, so this only happens if the site goes unused for two
months; resume it from the Atlas website.

## Scaling

Signs it's time to move up:

- storage above about 400 MB (Atlas → Cluster0 → Collections, or `db.stats()`);
- Atlas alerts about connections or operations, or slow syncs in busy hours;
- needing backups you can restore with one click.

The steps, smallest first:

1. **Make the app lighter first.** Most load is already trimmed (see
   [Database](database.md)): projections, a session cookie cache for reads,
   incremental leaderboard scoring, TTL clean-up.
2. **Flex tier.** Shared like M0 but paid by use, with more storage (5 GB),
   a higher operation limit and daily backups. In Atlas: Cluster0 → Edit
   Configuration → Flex. The connection string stays the same.
3. **Dedicated tier (M10 and up).** Servers of its own, storage and compute
   auto-scaling, point-in-time backups, the Performance Advisor and the
   Real-Time Performance Panel. Choose AWS Singapore again so it stays next to
   the function.
4. **More connections** come with the tier. On the app side, `maxPoolSize` in
   `server/mongo.ts` can be lowered if many function instances run at once.
5. **Sharding** isn't needed at any realistic size for this app. If it ever
   were, `userId` is the natural shard key: every query except the board and
   the class average is for one user.

Changing tier briefly interrupts the cluster. While it's down the API answers
`503`, and the app carries on offline: progress waits in the browser and
syncs afterwards.

## Operations

- **Monitoring:** Atlas → Cluster0 → Metrics shows connections, operations,
  network and storage. Atlas → Alerts lists raised alerts (none were open at
  the time of writing); add alert settings for connections and storage near
  their limits.
- **Backups:** M0 has none. Students' progress also lives in their browsers
  and their own exports, but for a server copy run `mongodump --uri
  "$MONGODB_URI"` from a trusted machine, and keep the dump private: it
  contains accounts. `mongorestore` puts it back.
- **Indexes** are created by the app on each cold start (`server/schema.ts`),
  so a new or restored database gets them without manual steps.
- **Upgrades:** Atlas upgrades M0's MongoDB version and handles maintenance
  itself; the app uses no version-specific features.
- **Rotating the app's password:** Atlas → Database Access → `medicine-app`
  → Edit → new password; update `MONGODB_URI` in Vercel and redeploy.
- **Tests** never touch the cluster: `server/mongo.integration.test.ts` runs
  against a local or throwaway server (`MONGODB_TEST_URI`), in a database it
  drops afterwards.
