const XLSX = require("xlsx");

const downloadExcel = async (req, res) => {
  try {
    const { data } = req.body; // Format: { "Person Name": { pedals: [...], totalPrice, totalOffer } }

    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data format" });
    }

    // Check if data is empty
    const dataEntries = Object.entries(data);
    if (dataEntries.length === 0) {
      return res.status(400).json({ error: "No data to download" });
    }

    // Check if any person has pedals
    const hasAnyPedals = dataEntries.some(([_, personData]) => {
      return personData && Array.isArray(personData.pedals) && personData.pedals.length > 0;
    });

    if (!hasAnyPedals) {
      return res.status(400).json({ error: "No pedals found in data" });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();

    for (const [personName, personData] of dataEntries) {
      // Skip if personData is invalid or has no pedals
      if (!personData || !Array.isArray(personData.pedals) || personData.pedals.length === 0) {
        continue;
      }

      const rows = [
        ["Person", "Pedal", "Condition", "Brand", "Buy Price", "FMV", "FMV Exp", "Reverb PG Hist Price", "Reverb PG Link", "Reverb Market Sold Price", "Reverb Market Sold link", "Amt Listed", "Sell Price", "Sell Exp", "No Match?", "Partial match?", "FMV", "Offer"],
      ];

      // Add pedal rows using customer/person name from calculation key
      for (const pedal of personData.pedals) {
        rows.push([
          personName,
          pedal.matchedProduct || pedal.pedal || "",
          pedal.condition || "",
          pedal.brand || "",
          pedal.buyPrice != null ? pedal.buyPrice : "",
          pedal.ptmBuyPrice != null ? pedal.ptmBuyPrice : "",
          pedal.ptmBuyPriceExpiresAt ? (typeof pedal.ptmBuyPriceExpiresAt === 'string' ? pedal.ptmBuyPriceExpiresAt.slice(0, 10) : pedal.ptmBuyPriceExpiresAt.toISOString().slice(0, 10)) : "",
          pedal.reverbPgHistPrice != null ? pedal.reverbPgHistPrice : "",
          pedal.reverbPgLink || "",
          pedal.reverbMarketSoldPrice != null ? pedal.reverbMarketSoldPrice : "",
          pedal.reverbMarketSoldLink || "",
          pedal.amtListedOnReverbMarket != null ? pedal.amtListedOnReverbMarket : "",
          pedal.ptmSellPrice != null ? pedal.ptmSellPrice : "",
          pedal.ptmSellPriceExpiresAt ? (typeof pedal.ptmSellPriceExpiresAt === 'string' ? pedal.ptmSellPriceExpiresAt.slice(0, 10) : pedal.ptmSellPriceExpiresAt.toISOString().slice(0, 10)) : "",
          pedal.noMatch ? "Yes" : "No",
          pedal.partialMatch ? "Yes" : "No",
          pedal.ptmBuyPrice != null ? pedal.ptmBuyPrice : 0,
          pedal.offer || 0,
        ]);
      }

      // Add total row
      rows.push([
        personName,
        "TOTAL",
        "",
        "",
        "", // Buy Price
        "", // FMV
        "", // FMV Exp
        "", // Reverb PG Hist Price
        "", // Reverb PG Link
        "", // Reverb Market Sold Price
        "", // Reverb Market Sold link
        "", // Amt Listed
        "", // Sell Price
        "", // Sell Exp
        "", // No Match?
        "", // Partial match?
        personData.totalPrice || 0, // FMV
        "", // Offer
      ]);

      // Add offer row
      rows.push([
        personName,
        "OFFER",
        "",
        "",
        "", // Buy Price
        "", // FMV
        "", // FMV Exp
        "", // Reverb PG Hist Price
        "", // Reverb PG Link
        "", // Reverb Market Sold Price
        "", // Reverb Market Sold link
        "", // Amt Listed
        "", // Sell Price
        "", // Sell Exp
        "", // No Match?
        "", // Partial match?
        "", // FMV
        personData.totalOffer || 0, // Offer
      ]);

      // Add empty row for spacing
      rows.push([]);

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(rows);

      // Add worksheet to workbook (one sheet per person, or combine all)
      if (dataEntries.length === 1) {
        XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
      } else {
        // Multiple people - use customer name for sheet name
        const sheetName = String(personName || "Results").substring(0, 31); // Excel sheet name limit
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
    }

    // If multiple people, also create a combined sheet
    if (dataEntries.length > 1) {
      const combinedRows = [
        ["Person", "Pedal", "Condition", "Brand", "Buy Price", "FMV", "FMV Exp", "Reverb PG Hist Price", "Reverb PG Link", "Reverb Market Sold Price", "Reverb Market Sold link", "Amt Listed", "Sell Price", "Sell Exp", "No Match?", "Partial match?", "FMV", "Offer"],
      ];

      for (const [personName, personData] of dataEntries) {
        // Skip if personData is invalid or has no pedals
        if (!personData || !Array.isArray(personData.pedals) || personData.pedals.length === 0) {
          continue;
        }

        for (const pedal of personData.pedals) {
          combinedRows.push([
            personName,
            pedal.matchedProduct || pedal.pedal || "",
            pedal.condition || "",
            pedal.brand || "",
            pedal.buyPrice != null ? pedal.buyPrice : "",
            pedal.ptmBuyPrice != null ? pedal.ptmBuyPrice : "",
            pedal.ptmBuyPriceExpiresAt ? (typeof pedal.ptmBuyPriceExpiresAt === 'string' ? pedal.ptmBuyPriceExpiresAt.slice(0, 10) : pedal.ptmBuyPriceExpiresAt.toISOString().slice(0, 10)) : "",
            pedal.reverbPgHistPrice != null ? pedal.reverbPgHistPrice : "",
            pedal.reverbPgLink || "",
            pedal.reverbMarketSoldPrice != null ? pedal.reverbMarketSoldPrice : "",
            pedal.reverbMarketSoldLink || "",
            pedal.amtListedOnReverbMarket != null ? pedal.amtListedOnReverbMarket : "",
            pedal.ptmSellPrice != null ? pedal.ptmSellPrice : "",
            pedal.ptmSellPriceExpiresAt ? (typeof pedal.ptmSellPriceExpiresAt === 'string' ? pedal.ptmSellPriceExpiresAt.slice(0, 10) : pedal.ptmSellPriceExpiresAt.toISOString().slice(0, 10)) : "",
            pedal.noMatch ? "Yes" : "No",
            pedal.partialMatch ? "Yes" : "No",
            pedal.ptmBuyPrice != null ? pedal.ptmBuyPrice : 0, // FMV is PTM Buy Price
            pedal.offer || 0,
          ]);
        }
        combinedRows.push([
          personName,
          "TOTAL",
          "",
          "",
          "", // Buy Price
          "", // FMV
          "", // FMV Exp
          "", // Reverb PG Hist Price
          "", // Reverb PG Link
          "", // Reverb Market Sold Price
          "", // Reverb Market Sold link
          "", // Amt Listed
          "", // Sell Price
          "", // Sell Exp
          "", // No Match?
          "", // Partial match?
          personData.totalPrice || 0, // FMV
          "", // Offer
        ]);
        combinedRows.push([
          personName,
          "OFFER",
          "",
          "",
          "", // Buy Price
          "", // FMV
          "", // FMV Exp
          "", // Reverb PG Hist Price
          "", // Reverb PG Link
          "", // Reverb Market Sold Price
          "", // Reverb Market Sold link
          "", // Amt Listed
          "", // Sell Price
          "", // Sell Exp
          "", // No Match?
          "", // Partial match?
          "", // FMV
          personData.totalOffer || 0, // Offer
        ]);
        combinedRows.push([]);
      }

      // Only create combined sheet if there are rows (more than just header)
      if (combinedRows.length > 1) {
        const combinedWorksheet = XLSX.utils.aoa_to_sheet(combinedRows);
        XLSX.utils.book_append_sheet(workbook, combinedWorksheet, "All Results");
      }
    }

    // Check if workbook has any sheets before writing
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Cannot create spreadsheet: no valid data found" });
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pedal_prices_${Date.now()}.xlsx"`
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error in /api/download:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  downloadExcel,
};
