"""Canonical seed dataset for the pandas-refresher.

Three DataFrames modeling a tiny CRM, reused verbatim from the SQL-refresher so
the two courses ask the same questions on the same data (SQL vs pandas):

    customers (15) - companies in the CRM
    deals     (30) - sales opportunities; closed_date is NaT while a deal is open
    reps       (5) - the sales team

Every lesson operates on these three DataFrames, made available in the learner's
namespace as `customers`, `deals`, and `reps`. Dates are real datetime64[ns];
open deals have a NaT closed_date. Keep this file the single source of truth.
"""

import pandas as pd


def build_frames():
    reps = pd.DataFrame(
        {
            "rep_id": [1, 2, 3, 4, 5],
            "name": ["Dana Whitfield", "Marcus Lee", "Priya Nair", "Tom Okafor", "Sofia Reyes"],
            "region": ["West", "East", "West", "Central", "East"],
            "hired_date": pd.to_datetime(
                ["2023-03-15", "2021-11-02", "2024-06-20", "2022-01-08", "2025-02-27"]
            ),
        }
    )

    customers = pd.DataFrame(
        {
            "customer_id": list(range(1, 16)),
            "name": [
                "Acme Industries", "Brightside Health", "Cascade Retail Group", "DataForge Labs",
                "Eiffel Logistics", "Fjord Analytics", "Garcia & Sons", "Helios Energy",
                "Ivywood Academy", "Juniper Software", "Kensington Finance", "Lakeshore Clinic",
                "Maple Retail Co", "Northwind Traders", "Orbit Software",
            ],
            "industry": [
                "Manufacturing", "Healthcare", "Retail", "Software", "Logistics", "Software",
                "Retail", "Manufacturing", "Education", "Software", "Finance", "Healthcare",
                "Retail", "Finance", "Software",
            ],
            "city": [
                "Chicago", "Boston", "Seattle", "Austin", "Paris", "Oslo", "Madrid", "Houston",
                "London", "Berlin", "London", "Toronto", "Vancouver", "Amsterdam", "San Francisco",
            ],
            "country": [
                "United States", "United States", "United States", "United States", "France",
                "Norway", "Spain", "United States", "United Kingdom", "Germany", "United Kingdom",
                "Canada", "Canada", "Netherlands", "United States",
            ],
            "signup_date": pd.to_datetime(
                [
                    "2024-01-15", "2023-06-03", "2025-03-22", "2024-09-10", "2023-11-30",
                    "2025-07-14", "2022-05-19", "2025-01-05", "2024-04-25", "2023-08-12",
                    "2022-10-01", "2025-05-08", "2024-12-02", "2023-02-17", "2025-09-28",
                ]
            ),
        }
    )

    _deals = [
        (1, 1, 2, 24000, "Won", "2025-01-10", "2025-02-18"),
        (2, 1, 2, 8500, "Lost", "2025-06-01", "2025-07-11"),
        (3, 2, 4, 32000, "Won", "2025-02-14", "2025-04-02"),
        (4, 3, 1, 5600, "Prospecting", "2026-01-08", None),
        (5, 4, 3, 45000, "Won", "2025-03-20", "2025-05-30"),
        (6, 4, 3, 12000, "Proposal", "2026-02-11", None),
        (7, 5, 5, 18500, "Qualified", "2026-01-25", None),
        (8, 6, 3, 27500, "Won", "2025-08-05", "2025-09-15"),
        (9, 6, 3, 9900, "Prospecting", "2026-03-01", None),
        (10, 7, 5, 4200, "Lost", "2025-04-12", "2025-05-01"),
        (11, 7, 5, 7600, "Won", "2025-10-09", "2025-11-20"),
        (12, 8, 4, 61000, "Proposal", "2026-01-15", None),
        (13, 8, 4, 15000, "Won", "2025-06-22", "2025-08-01"),
        (14, 10, 1, 22000, "Won", "2025-05-04", "2025-06-12"),
        (15, 10, 1, 6800, "Qualified", "2026-02-28", None),
        (16, 11, 2, 54000, "Won", "2025-09-18", "2025-11-30"),
        (17, 11, 2, 13500, "Lost", "2026-01-05", "2026-02-14"),
        (18, 12, 4, 8900, "Prospecting", "2026-03-10", None),
        (19, 14, 5, 36000, "Won", "2025-07-07", "2025-08-25"),
        (20, 14, 5, 11000, "Proposal", "2026-02-20", None),
        (21, 15, 1, 48000, "Won", "2025-11-11", "2026-01-09"),
        (22, 15, 1, 9500, "Qualified", "2026-03-05", None),
        (23, 2, 4, 7400, "Lost", "2025-09-02", "2025-09-30"),
        (24, 3, 1, 16500, "Won", "2025-12-01", "2026-01-22"),
        (25, 5, 5, 29000, "Won", "2025-03-15", "2025-04-28"),
        (26, 6, 3, 3100, "Lost", "2025-12-12", "2026-01-15"),
        (27, 10, 2, 41000, "Proposal", "2026-03-18", None),
        (28, 12, 4, 5200, "Qualified", "2026-03-22", None),
        (29, 1, 2, 19800, "Prospecting", "2026-04-02", None),
        (30, 15, 3, 33500, "Won", "2026-01-30", "2026-03-12"),
    ]
    deals = pd.DataFrame(
        _deals,
        columns=["deal_id", "customer_id", "rep_id", "amount", "stage", "opened_date", "closed_date"],
    )
    deals["opened_date"] = pd.to_datetime(deals["opened_date"])
    deals["closed_date"] = pd.to_datetime(deals["closed_date"])

    return customers, deals, reps


customers, deals, reps = build_frames()

if __name__ == "__main__":
    for label, frame in [("customers", customers), ("deals", deals), ("reps", reps)]:
        print(f"== {label}: {frame.shape[0]} rows x {frame.shape[1]} cols ==")
        print(frame.dtypes.to_string())
        print()
