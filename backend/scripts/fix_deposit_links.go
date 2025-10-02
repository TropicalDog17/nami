package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	// Database connection - update with your credentials
	db, err := sql.Open("postgres", "postgres://username:password@localhost/nami?sslmode=disable")
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Test the connection
	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	fmt.Println("Connected to database successfully")

	// Fix the specific link we identified
	withdrawID := "e6fa41de-b32c-472c-82ef-e7572ea0e7eb"
	depositID := "d299bc21-18ac-4920-8f3f-067c76418574"

	// Update the withdraw transaction to link it to the deposit
	query := `UPDATE transactions SET deposit_id = $1, updated_at = $2 WHERE id = $3`
	result, err := db.Exec(query, depositID, time.Now(), withdrawID)
	if err != nil {
		log.Fatal("Failed to update withdraw transaction:", err)
	}

	rowsAffected, _ := result.RowsAffected()
	fmt.Printf("Updated %d withdraw transaction(s)\n", rowsAffected)

	// Find other potential matches for linking
	fmt.Println("\nSearching for other potential links...")

	// Find unstake/withdraw transactions without deposit_id that could be linked to deposits
	searchQuery := `
		SELECT
			w.id as withdraw_id,
			w.asset,
			w.account,
			w.quantity,
			w.date,
			d.id as potential_deposit_id,
			d.quantity as deposit_quantity,
			d.date as deposit_date
		FROM transactions w
		LEFT JOIN transactions d ON (
			d.asset = w.asset AND
			d.type IN ('deposit', 'stake', 'buy') AND
			d.date <= w.date AND
			d.deposit_id IS NULL AND
			ABS(d.quantity - w.quantity) < 0.01 * d.quantity -- Allow small differences
		)
		WHERE w.type IN ('withdraw', 'unstake', 'sell')
		AND w.deposit_id IS NULL
		AND d.id IS NOT NULL
		ORDER BY w.date, w.asset
	`

	rows, err := db.Query(searchQuery)
	if err != nil {
		log.Fatal("Failed to search for potential links:", err)
	}
	defer rows.Close()

	var potentialLinks []struct {
		WithdrawID          string
		Asset               string
		Account             string
		WithdrawQuantity    float64
		WithdrawDate        time.Time
		PotentialDepositID  string
		DepositQuantity     float64
		DepositDate         time.Time
	}

	for rows.Next() {
		var link struct {
			WithdrawID          string
			Asset               string
			Account             string
			WithdrawQuantity    float64
			WithdrawDate        time.Time
			PotentialDepositID  string
			DepositQuantity     float64
			DepositDate         time.Time
		}
		err := rows.Scan(
			&link.WithdrawID, &link.Asset, &link.Account, &link.WithdrawQuantity, &link.WithdrawDate,
			&link.PotentialDepositID, &link.DepositQuantity, &link.DepositDate,
		)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		potentialLinks = append(potentialLinks, link)
	}

	if len(potentialLinks) > 0 {
		fmt.Printf("Found %d potential links:\n", len(potentialLinks))
		for _, link := range potentialLinks {
			fmt.Printf("Withdraw %s (%.2f %s on %s) -> Deposit %s (%.2f %s on %s)\n",
				link.WithdrawID[:8], link.WithdrawQuantity, link.Asset, link.WithdrawDate.Format("2006-01-02"),
				link.PotentialDepositID[:8], link.DepositQuantity, link.Asset, link.DepositDate.Format("2006-01-02"))
		}

		fmt.Println("\nTo apply these links, uncomment the batch update section in the script.")
	} else {
		fmt.Println("No other potential links found.")
	}

	// Batch update section (commented out for safety)
	/*
	for _, link := range potentialLinks {
		updateQuery := `UPDATE transactions SET deposit_id = $1, updated_at = $2 WHERE id = $3`
		_, err := db.Exec(updateQuery, link.PotentialDepositID, time.Now(), link.WithdrawID)
		if err != nil {
			log.Printf("Failed to update withdraw transaction %s: %v", link.WithdrawID, err)
		} else {
			fmt.Printf("Linked withdraw %s to deposit %s\n", link.WithdrawID[:8], link.PotentialDepositID[:8])
		}
	}
	*/

	fmt.Println("\nScript completed successfully!")
}