from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.schemas.venues import NearbyVenuesResponse
from app.services import venues as venues_service

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("/nearby", response_model=NearbyVenuesResponse)
async def get_nearby_venues(
    sport: str = Query(..., description="Sport filter: gym|golf|tennis|running"),
    lat: float | None = Query(None, ge=-90.0, le=90.0),
    lng: float | None = Query(None, ge=-180.0, le=180.0),
    # Radius applies only when both lat and lng are supplied; the service
    # silently ignores it in the no-coordinate catalog fallback path.
    radius_km: float = Query(10.0, ge=1.0, le=50.0),
    limit: int = Query(20, ge=1, le=50),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NearbyVenuesResponse:
    if (lat is None) != (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lat and lng must be provided together",
        )
    return await venues_service.list_nearby_venues(
        db=db, sport=sport, lat=lat, lng=lng, radius_km=radius_km, limit=limit
    )
