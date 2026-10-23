"""Ordinary shared outputs across input regions, without an attention recipe."""
import torch
from torch import nn


class ContextWeaver(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 8)
        self.funnel = nn.Linear(8, 8)
        self.second = nn.Linear(4, 8)
        self.branch_a = nn.Linear(8, 8)
        self.branch_b = nn.Linear(8, 8)
        self.merge = nn.Linear(8, 4)

    def left_path(self, first):
        return self.funnel(torch.relu(self.project(first)))

    def right_path(self, second, side):
        core = self.second(second)
        alpha = self.branch_a(side)
        beta = self.branch_b(side)
        return self.merge(core + alpha + beta)

    def forward(self, first, second):
        side = self.left_path(first)
        return self.right_path(second, side)
