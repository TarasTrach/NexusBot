import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("bot_settings")
export class Setting {
  @PrimaryColumn()
  key!: string;

  @Column({ type: "double precision" })
  value!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
