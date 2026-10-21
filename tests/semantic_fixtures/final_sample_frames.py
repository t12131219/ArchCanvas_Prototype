"""Static unfamiliar compositions of local repeats and external boundaries."""
import torch
from torch import nn


class Piece(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(12, 12)

    def forward(self, signal, context):
        return signal + torch.tanh(self.project(signal)) * torch.sigmoid(context)


class InterlockedRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.ModuleList([Piece(), Piece(), Piece()])
        self.right = nn.ModuleList([Piece(), Piece(), Piece()])

    def first(self, value, context):
        for part in self.left:
            value = part(value, context)
        return value

    def second(self, value, context):
        for part in self.right:
            value = part(value, context)
        return value

    def forward(self, source, side, context):
        prepared = self.first(source, context)
        mixed = self.second(torch.relu(side), prepared)
        return torch.cat((prepared, mixed), dim=-1)


class UnknownNeighborRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.ModuleList([Piece(), Piece(), Piece()])
        self.right = nn.ModuleList([Piece(), Piece(), Piece()])

    def first(self, value, context):
        for part in self.left:
            value = part(value, context)
        return value

    def second(self, value, context):
        for part in self.right:
            value = part(value, context)
        return value

    def forward(self, source, side, context):
        prepared = self.first(source, context)
        unknown = foreign_boundary(side)
        mixed = self.second(unknown, prepared)
        return torch.cat((prepared, mixed), dim=-1)


class ConditionalNeighborRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.ModuleList([Piece(), Piece(), Piece()])
        self.right = nn.ModuleList([Piece(), Piece(), Piece()])

    def first(self, value, context):
        for part in self.left:
            value = part(value, context)
        return value

    def second(self, value, context):
        for part in self.right:
            value = part(value, context)
        return value

    def forward(self, source, side, context):
        prepared = self.first(source, context)
        if side.sum() > 0:
            value = torch.relu(side)
        else:
            value = torch.tanh(side)
        mixed = self.second(value, prepared)
        return torch.cat((prepared, mixed), dim=-1)


class SharedRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.part = Piece()
        self.parts = nn.ModuleList([self.part, self.part, self.part])

    def forward(self, source, context):
        for part in self.parts:
            source = part(source, context)
        return source


class MutablePiece(nn.Module):
    def forward(self, source, context):
        return source.add_(context)


class MutableRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([MutablePiece(), MutablePiece(), MutablePiece()])

    def forward(self, source, context):
        for part in self.parts:
            source = part(source, context)
        return source
