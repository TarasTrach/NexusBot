import fs from "fs";
import path from "path";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Setting } from "./setting.entity";

export enum SettingKey {
  PaypalRate = "paypal_rate",
  UsdAmount = "usd_amount",
  DiscountPercent = "discount_percent",
  OrderIndex = "order_index",
}

const DEFAULTS: Record<SettingKey, number> = {
  [SettingKey.PaypalRate]: 0,
  [SettingKey.UsdAmount]: 300,
  [SettingKey.DiscountPercent]: 4,
  [SettingKey.OrderIndex]: 1,
};

// Legacy txt-file "database" this project used before Postgres.
const LEGACY_FILES: Record<SettingKey, string> = {
  [SettingKey.PaypalRate]: "rate.txt",
  [SettingKey.UsdAmount]: "usd_amount.txt",
  [SettingKey.DiscountPercent]: "discount_percent.txt",
  [SettingKey.OrderIndex]: "order_index.txt",
};

const LEGACY_DIRS = [
  path.join(process.cwd(), "dist", "config"),
  path.join(process.cwd(), "src", "config"),
];

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(Setting)
    private readonly repo: Repository<Setting>
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedMissingKeys();
  }

  async get(key: SettingKey): Promise<number> {
    const row = await this.repo.findOneBy({ key });
    return row ? Number(row.value) : DEFAULTS[key];
  }

  async set(key: SettingKey, value: number): Promise<void> {
    await this.repo.save({ key, value });
  }

  private async seedMissingKeys(): Promise<void> {
    for (const key of Object.values(SettingKey)) {
      const exists = await this.repo.existsBy({ key });
      if (exists) continue;

      const legacy = this.readLegacyValue(key);
      const value = legacy ?? DEFAULTS[key];
      await this.repo.save({ key, value });
      this.logger.log(
        `Seeded "${key}" = ${value}${legacy != null ? " (imported from legacy txt)" : " (default)"}`
      );
    }
  }

  private readLegacyValue(key: SettingKey): number | null {
    for (const dir of LEGACY_DIRS) {
      const file = path.join(dir, LEGACY_FILES[key]);
      try {
        const raw = fs.readFileSync(file, "utf-8").trim();
        const value = parseFloat(raw.replace(",", "."));
        if (!isNaN(value) && value > 0) return value;
      } catch {
        // file missing — try next location
      }
    }
    return null;
  }
}
