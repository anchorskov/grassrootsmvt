# Staging Table Field Alignment with D1 Schema

## ✅ **Field Mapping Summary**

### **Voter Information Fields**
| Staging Table | Existing D1 Table | Purpose |
|---------------|-------------------|---------|
| `fn` | `v_voters_addr_norm.fn` | First name - exact match |
| `ln` | `v_voters_addr_norm.ln` | Last name - exact match |
| `middle_name` | *(new field)* | Middle name capture |
| `suffix` | *(new field)* | Jr, Sr, III suffixes |

### **Address Fields**
| Staging Table | Existing D1 Table | Purpose |
|---------------|-------------------|---------|
| `addr1` | `v_voters_addr_norm.addr1` | Full address - exact match |
| `city` | `v_voters_addr_norm.city` | City name - exact match |
| `county` | `voters.county` | County name - exact match |
| `state` | `v_voters_addr_norm.state` | State code - exact match |
| `zip` | `v_voters_addr_norm.zip` | ZIP code - exact match |

### **Contact Fields**
| Staging Table | Existing D1 Table | Purpose |
|---------------|-------------------|---------|
| `phone_e164` | `v_best_phone.phone_e164` | Primary phone - exact match |
| `phone_secondary` | *(new field)* | Secondary phone capture |
| `email` | *(new field)* | Email address |

### **Political Fields**
| Staging Table | Existing D1 Table | Purpose |
|---------------|-------------------|---------|
| `political_party` | `voters.political_party` | Party affiliation - exact match |

### **Search & Progressive Validation Fields**
| Staging Table | Purpose |
|---------------|---------|
| `search_county` | County selection (step 1) |
| `search_city` | City selection (step 1) |
| `search_street_name` | Street validation (step 2) |
| `search_house_number` | Address validation (step 2) |

### **Interaction Tracking Fields** *(New for Volunteer Workflow)*
| Staging Table | Purpose |
|---------------|---------|
| `contact_method` | How volunteer met voter |
| `voting_likelihood` | Volunteer assessment |
| `interaction_notes` | Conversation details |
| `issues_interested` | Political interests |
| `volunteer_notes` | Follow-up notes |

### **Verification & Status Fields** *(New for Review Process)*
| Staging Table | Purpose |
|---------------|---------|
| `status` | pending/verified/duplicate/rejected |
| `potential_matches` | JSON array of similar voter_ids |
| `needs_manual_review` | Flag for human review |
| `verification_notes` | Admin review notes |
| `integrated_voter_id` | Link to existing voter if matched |

## 🔄 **Integration Flow**

1. **Form Submission** → Uses aligned field names (`fn`, `ln`, `addr1`, etc.)
2. **Duplicate Detection** → Queries existing tables with matching field names
3. **Data Migration** → Direct field mapping when promoting to main tables
4. **API Compatibility** → Seamless integration with existing queries

## 📋 **Benefits of Field Alignment**

✅ **Zero Translation Layer** - Direct INSERT from staging to main tables  
✅ **Consistent Queries** - Same field names across all tables  
✅ **Simplified Integration** - No field mapping required during promotion  
✅ **API Compatibility** - Existing queries work with staging data  
✅ **Future-Proof** - New fields don't conflict with existing schema

## 🚀 **Ready for Implementation**

The updated staging table schema now perfectly aligns with your existing D1 database structure, ensuring seamless integration between volunteer-submitted contacts and your existing voter database.