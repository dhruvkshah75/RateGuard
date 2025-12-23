# RateGuard

**Distributed, high-performance API rate limiter with real-time management dashboard.**

## Overview
RateGuard is a microservices-based SaaS platform that allows developers to protect their APIs from abuse. It features a high-speed proxy (Data Plane) powered by Redis and a management dashboard (Control Plane) built with React and PostgreSQL.

## Tech Stack
* **Runtime:** [Bun](https://bun.sh) (Fast JavaScript runtime)
* **Framework:** [ElysiaJS](https://elysiajs.com) (High-performance web framework)
* **Database:** PostgreSQL (Storage) & Redis (Cache/Rate Counting)
* **ORM:** Prisma
* **Frontend:** React + Vite + TailwindCSS
* **Architecture:** Monorepo with Docker Support

## Repository Structure
```text
RateGuard/
├── services/
│   ├── proxy/           # High-speed Edge Proxy (Redis + Logic)
│   ├── dashboard-api/   # Management API (Auth + Postgres)
│   └── frontend/        # User Dashboard (React)
├── docker-compose.yml   # Infrastructure (DB & Cache)
└── README.md

```

## Quick Start

### 1. Prerequisites

* [Bun](https://bun.sh) installed
* Docker & Docker Compose running

### 2. Start Infrastructure

```bash
# Spins up Redis (Cache) and PostgreSQL (DB)
docker compose up -d

```

### 3. Run the Services (Dev Mode)

**Terminal 1: Dashboard API (Control Plane)**

```bash
cd services/dashboard-api
bun install
bunx prisma migrate dev --name init  # Setup DB tables
bun run src/index.ts                 # Runs on localhost:3000

```

**Terminal 2: Proxy (Data Plane)**

```bash
cd services/proxy
bun install
bun run src/index.ts                 # Runs on localhost:8080

```

## Status

**Current Phase:** Initial Development (MVP).

* Basic Proxy Setup
* Distributed Rate Limiting (Fixed Window)
* User Authentication (JWT)
* React Dashboard Integration (In Progress)

---